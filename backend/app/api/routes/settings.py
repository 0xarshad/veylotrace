from typing import Annotated, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, client_ip, require_permission
from app.core.errors import conflict, not_found
from app.models import AuditEvent, User, UserSettings
from app.services.audit import audit
from app.services.auth import revoke_all_sessions
from app.services.defaults import DEFAULT_TARGETS, DEFAULT_WIDGETS, suggested_nutrition_targets
from fastapi import Depends

router = APIRouter(tags=["settings"])

AI_MODULES = ["finance", "health", "nutrition", "lifestyle", "productivity", "learning", "social"]
TARGET_LIMITS = {k: (0, 1_000_000) for k in DEFAULT_TARGETS}


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    theme: Literal["light", "dark", "system"] | None = None
    currency: Annotated[str, Field(min_length=1, max_length=8)] | None = None
    week_starts_monday: bool | None = None
    dashboard_widgets: list[str] | None = None
    targets: dict[str, float] | None = None
    ai_enabled: bool | None = None
    ai_modules: list[str] | None = None
    auto_backup_hours: Annotated[int, Field(ge=0, le=720)] | None = None
    height_cm: float | None = Field(default=None, gt=80, lt=250)
    starting_weight_kg: float | None = Field(default=None, gt=20, lt=500)
    body_fat_percent: float | None = Field(default=None, ge=1, le=75)
    target_weight_kg: float | None = Field(default=None, gt=20, lt=500)

    @field_validator("dashboard_widgets")
    @classmethod
    def _widgets(cls, v):
        if v is not None and any(w not in DEFAULT_WIDGETS for w in v):
            raise ValueError("Unknown dashboard widget.")
        return v

    @field_validator("ai_modules")
    @classmethod
    def _modules(cls, v):
        if v is not None and any(m not in AI_MODULES for m in v):
            raise ValueError("Unknown module.")
        return sorted(set(v)) if v is not None else v

    @field_validator("targets")
    @classmethod
    def _targets(cls, v):
        if v is None:
            return v
        for k, val in v.items():
            if k not in TARGET_LIMITS:
                raise ValueError(f"Unknown target '{k}'.")
            lo, hi = TARGET_LIMITS[k]
            if not lo <= val <= hi:
                raise ValueError(f"Target '{k}' is out of range.")
        return v


def settings_out(s: UserSettings) -> dict:
    targets = {**DEFAULT_TARGETS, **(s.targets or {})}
    return {
        "theme": s.theme, "currency": s.currency, "week_starts_monday": s.week_starts_monday,
        "dashboard_widgets": s.dashboard_widgets if s.dashboard_widgets is not None else DEFAULT_WIDGETS,
        "available_widgets": DEFAULT_WIDGETS, "targets": targets,
        "suggested_nutrition_targets": suggested_nutrition_targets(s.target_weight_kg, targets["calories"]) if s.target_weight_kg else None,
        "ai_enabled": s.ai_enabled, "ai_modules": s.ai_modules or [], "available_ai_modules": AI_MODULES,
        "auto_backup_hours": s.auto_backup_hours,
        "height_cm": s.height_cm, "starting_weight_kg": s.starting_weight_kg,
        "body_fat_percent": s.body_fat_percent, "target_weight_kg": s.target_weight_kg,
    }


def get_or_create_settings(db, user_id: int) -> UserSettings:
    s = db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))
    if s is None:
        s = UserSettings(user_id=user_id, dashboard_widgets=list(DEFAULT_WIDGETS), targets=dict(DEFAULT_TARGETS))
        db.add(s)
        db.commit()
    return s


@router.get("/settings")
def get_settings_route(db: DB, user: CurrentUser):
    return settings_out(get_or_create_settings(db, user.id))


@router.put("/settings")
def put_settings(body: SettingsIn, request: Request, db: DB, user: CurrentUser):
    s = get_or_create_settings(db, user.id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None:
            continue
        if k == "targets":
            v = {**(s.targets or {}), **v}
        setattr(s, k, v)
    audit(db, "settings.update", user.id, client_ip(request), fields=sorted(body.model_dump(exclude_unset=True)))
    db.commit()
    return settings_out(s)


# ---------------- admin ----------------
admin = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_permission("admin:manage"))])


def _user_row(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role.name, "is_active": u.is_active,
            "email_verified": u.email_verified_at is not None, "created_at": u.created_at.isoformat()}


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool | None = None
    role: Literal["user", "admin"] | None = None


@admin.get("/users")
def list_users(db: DB, limit: int = 100, offset: int = 0):
    users = db.scalars(select(User).order_by(User.id).limit(min(max(limit, 1), 500)).offset(max(offset, 0)))
    return {"items": [_user_row(u) for u in users]}  # account metadata only: never any tracking data


@admin.patch("/users/{user_id}")
def update_user(user_id: int, body: AdminUserUpdate, request: Request, db: DB, me: User = Depends(require_permission("admin:manage"))):
    from app.models import Role

    target = db.get(User, user_id)
    if target is None:
        raise not_found("User not found.")
    if target.id == me.id:
        raise conflict("You cannot change your own role or status.", "self_modification")
    if body.is_active is not None:
        target.is_active = body.is_active
        if not body.is_active:
            revoke_all_sessions(db, target.id, "admin_disabled")
    if body.role is not None:
        target.role_id = db.scalar(select(Role.id).where(Role.name == body.role))
        revoke_all_sessions(db, target.id, "role_changed")
    audit(db, "admin.user_update", me.id, client_ip(request), target=target.id, changes=body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(target)
    return _user_row(target)


@admin.get("/audit")
def audit_log(db: DB, limit: int = 100, offset: int = 0, action: str | None = None):
    stmt = select(AuditEvent).order_by(AuditEvent.id.desc())
    if action:
        stmt = stmt.where(AuditEvent.action == action)
    rows = db.scalars(stmt.limit(min(max(limit, 1), 500)).offset(max(offset, 0)))
    return {"items": [{"id": r.id, "user_id": r.user_id, "action": r.action, "ip": r.ip, "detail": r.detail, "created_at": r.created_at.isoformat()} for r in rows]}


