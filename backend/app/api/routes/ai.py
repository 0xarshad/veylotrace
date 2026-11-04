from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.core.deps import DB, client_ip, require_permission
from app.core.errors import AppError, bad_request, conflict, not_found
from app.core.ratelimit import limiter
from app.core.security import encrypt_secret, utcnow
from app.models import AIConversation, AIProviderConfig, AIReport, AIRequestLog, User, UserSettings
from app.services.ai import assistant as svc
from app.services.ai.providers import catalog, get_adapter
from app.services.ai.providers.base import ProviderError, validate_base_url
from app.services.audit import audit

perm = Depends(require_permission("tracking:own"))
router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[perm])

ProviderId = Literal["groq", "openai", "anthropic", "ollama", "huggingface"]


class ProviderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: ProviderId
    api_key: Annotated[str, Field(min_length=8, max_length=600)] | None = None
    base_url: Annotated[str, Field(max_length=300)] | None = None
    model: Annotated[str, Field(max_length=200)] | None = None
    params: dict[str, float] = {}
    enabled: bool = True
    cloud_consent: bool = False
    make_default: bool = False


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: Annotated[str, Field(min_length=8, max_length=600)] | None = None
    clear_key: bool = False
    base_url: Annotated[str, Field(max_length=300)] | None = None
    model: Annotated[str, Field(max_length=200)] | None = None
    params: dict[str, float] | None = None
    enabled: bool | None = None
    cloud_consent: bool | None = None


class ReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[tuple(svc.REPORT_KINDS)]  # type: ignore[valid-type]
    start: date | None = None
    end: date | None = None
    provider_id: int | None = None


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: Annotated[str, Field(min_length=1, max_length=2000)]
    conversation_id: int | None = None
    start: date | None = None
    end: date | None = None
    provider_id: int | None = None


def _owned_cfg(db, uid: int, cid: int) -> AIProviderConfig:
    cfg = db.scalar(select(AIProviderConfig).where(AIProviderConfig.id == cid, AIProviderConfig.user_id == uid, AIProviderConfig.deleted_at.is_(None)))
    if cfg is None:
        raise not_found("Provider not found.")
    return cfg


def _validate_params(adapter, params: dict) -> dict:
    unknown = set(params) - set(adapter.param_schema)
    if unknown:
        raise AppError(422, "validation_error", f"Unsupported parameter(s): {', '.join(sorted(unknown))}.")
    for k, v in params.items():
        lo, hi = adapter.param_schema[k]
        if not lo <= v <= hi:
            raise AppError(422, "validation_error", f"Parameter '{k}' must be between {lo} and {hi}.")
    return dict(params)


def _validate_url(provider: str, url: str | None) -> str | None:
    adapter = get_adapter(provider)
    if not url:
        return None
    if not adapter.supports_base_url:
        raise AppError(422, "validation_error", f"{adapter.label} does not use a custom URL.")
    try:
        return validate_base_url(url, allow_local=not adapter.cloud)
    except ProviderError as err:
        raise AppError(422, "validation_error", err.message, [{"field": "base_url", "message": err.message}])


def _set_default(db, uid: int, cfg: AIProviderConfig) -> None:
    for other in db.scalars(select(AIProviderConfig).where(AIProviderConfig.user_id == uid, AIProviderConfig.is_default.is_(True))):
        other.is_default = False
    cfg.is_default = True


# ---------------- providers ----------------
@router.get("/catalog")
def get_catalog():
    return catalog()


@router.get("/providers")
def list_providers(db: DB, user: User = perm):
    rows = db.scalars(select(AIProviderConfig).where(AIProviderConfig.user_id == user.id, AIProviderConfig.deleted_at.is_(None)).order_by(AIProviderConfig.id))
    return [svc.config_out(c) for c in rows]


@router.post("/providers", status_code=201)
def add_provider(body: ProviderIn, request: Request, db: DB, user: User = perm):
    adapter = get_adapter(body.provider)
    if adapter.needs_key and not body.api_key:
        raise AppError(422, "validation_error", f"{adapter.label} needs an API key or token.", [{"field": "api_key", "message": "Required."}])
    if db.scalar(select(AIProviderConfig.id).where(AIProviderConfig.user_id == user.id, AIProviderConfig.provider == body.provider)):
        raise conflict("This provider is already configured; edit the existing entry.", "provider_exists")
    cfg = AIProviderConfig(
        user_id=user.id, provider=body.provider, enabled=body.enabled, base_url=_validate_url(body.provider, body.base_url),
        model=body.model or adapter.default_model, params=_validate_params(adapter, body.params),
        cloud_consent=body.cloud_consent, consent_at=utcnow() if body.cloud_consent else None,
    )
    if body.api_key:
        cfg.api_key_encrypted = encrypt_secret(body.api_key)
        cfg.key_hint = body.api_key[-4:]
    db.add(cfg)
    db.flush()
    has_default = db.scalar(select(func.count()).select_from(AIProviderConfig).where(AIProviderConfig.user_id == user.id, AIProviderConfig.is_default.is_(True)))
    if body.make_default or not has_default:
        _set_default(db, user.id, cfg)
    audit(db, "ai.provider_added", user.id, client_ip(request), provider=body.provider)
    db.commit()
    return svc.config_out(cfg)


@router.patch("/providers/{provider_id}")
def edit_provider(provider_id: int, body: ProviderUpdate, request: Request, db: DB, user: User = perm):
    cfg = _owned_cfg(db, user.id, provider_id)
    adapter = get_adapter(cfg.provider)
    sent = body.model_dump(exclude_unset=True)
    if body.api_key:
        cfg.api_key_encrypted = encrypt_secret(body.api_key)
        cfg.key_hint = body.api_key[-4:]
        cfg.last_test_ok = None
    if body.clear_key:
        if adapter.needs_key:
            raise bad_request("This provider requires a key; remove the provider instead.")
        cfg.api_key_encrypted = cfg.key_hint = None
    if "base_url" in sent:
        cfg.base_url = _validate_url(cfg.provider, body.base_url)
    if "model" in sent:
        cfg.model = body.model or adapter.default_model
    if body.params is not None:
        cfg.params = _validate_params(adapter, body.params)
    if body.enabled is not None:
        cfg.enabled = body.enabled
    if body.cloud_consent is not None:
        cfg.cloud_consent = body.cloud_consent
        cfg.consent_at = utcnow() if body.cloud_consent else None
    audit(db, "ai.provider_updated", user.id, client_ip(request), provider=cfg.provider, fields=[k for k in sent if k != "api_key"])
    db.commit()
    return svc.config_out(cfg)


@router.delete("/providers/{provider_id}")
def remove_provider(provider_id: int, request: Request, db: DB, user: User = perm):
    cfg = _owned_cfg(db, user.id, provider_id)
    was_default = cfg.is_default
    provider = cfg.provider
    db.delete(cfg)  # hard delete: credentials must not linger
    db.flush()
    if was_default:
        nxt = db.scalar(select(AIProviderConfig).where(AIProviderConfig.user_id == user.id).order_by(AIProviderConfig.id))
        if nxt:
            _set_default(db, user.id, nxt)
    audit(db, "ai.provider_removed", user.id, client_ip(request), provider=provider)
    db.commit()
    return {"message": "Provider removed and credentials deleted."}


@router.post("/providers/{provider_id}/default")
def make_default(provider_id: int, db: DB, user: User = perm):
    cfg = _owned_cfg(db, user.id, provider_id)
    _set_default(db, user.id, cfg)
    db.commit()
    return svc.config_out(cfg)


@router.post("/providers/{provider_id}/test")
def test_provider(provider_id: int, db: DB, user: User = perm):
    limiter.check(f"ai-test:{user.id}", 10, 60, "Too many connection tests. Please wait.")
    cfg = _owned_cfg(db, user.id, provider_id)
    result = get_adapter(cfg.provider).test(svc.runtime_for(cfg))
    cfg.last_test_ok, cfg.last_test_at = result.ok, utcnow()
    cfg.last_error = None if result.ok else result.message
    db.add(AIRequestLog(user_id=user.id, provider=cfg.provider, kind="connection_test", ok=result.ok, error=None if result.ok else result.message, latency_ms=0, created_at=utcnow()))
    db.commit()
    return {"ok": result.ok, "message": result.message, "models": result.models}


@router.get("/providers/{provider_id}/models")
def provider_models(provider_id: int, db: DB, user: User = perm):
    limiter.check(f"ai-models:{user.id}", 20, 60)
    cfg = _owned_cfg(db, user.id, provider_id)
    adapter = get_adapter(cfg.provider)
    try:
        live = adapter.list_models(svc.runtime_for(cfg))
        return {"models": live, "source": "provider"}
    except ProviderError as err:
        return {"models": adapter.suggested_models, "source": "suggested", "warning": err.message}


# ---------------- status / privacy ----------------
@router.get("/status")
def status(db: DB, user: User = perm):
    s = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    default = db.scalar(select(AIProviderConfig).where(AIProviderConfig.user_id == user.id, AIProviderConfig.is_default.is_(True)))
    errors = db.scalars(select(AIRequestLog).where(AIRequestLog.user_id == user.id, AIRequestLog.ok.is_(False)).order_by(AIRequestLog.id.desc()).limit(10))
    return {
        "ai_enabled": bool(s and s.ai_enabled),
        "modules": (s.ai_modules if s else []) or [],
        "available_modules": svc.ALL_MODULES,
        "default_provider": svc.config_out(default) if default else None,
        "recent_errors": [{"provider": e.provider, "kind": e.kind, "error": e.error, "at": e.created_at.isoformat()} for e in errors],
        "privacy": {
            "sent": "Aggregated statistics and category/subject names only (shortened). Notes, descriptions, locations, participants and personal notes are never sent.",
            "external": bool(default and svc.is_cloud(default)),
        },
    }


@router.get("/report-kinds")
def report_kinds():
    return [{"id": k, "title": v["title"], "modules": v["modules"]} for k, v in svc.REPORT_KINDS.items()]


# ---------------- reports ----------------
def _report_out(r: AIReport, full: bool = True) -> dict:
    d = {"id": r.id, "kind": r.kind, "title": svc.REPORT_KINDS.get(r.kind, {}).get("title", r.kind), "range_start": r.range_start, "range_end": r.range_end,
         "provider": r.provider, "model": r.model, "created_at": r.created_at.isoformat(), "content": r.content}
    if full:
        d["facts"] = r.facts
    return d


@router.post("/reports", status_code=201)
def create_report(body: ReportIn, request: Request, db: DB, user: User = perm):
    if (body.start is None) != (body.end is None) or (body.start and body.end < body.start) or (body.start and (body.end - body.start).days > 366):
        raise bad_request("Provide both start and end (max one year), with end on or after start.")
    report = svc.generate_report(db, user, body.kind, body.start, body.end, body.provider_id)
    audit(db, "ai.report_generated", user.id, client_ip(request), kind=body.kind, provider=report.provider)
    db.commit()
    return _report_out(report)


@router.get("/reports")
def list_reports(db: DB, user: User = perm, limit: int = 50, offset: int = 0):
    rows = db.scalars(select(AIReport).where(AIReport.user_id == user.id, AIReport.deleted_at.is_(None)).order_by(AIReport.id.desc()).limit(min(max(limit, 1), 200)).offset(max(offset, 0)))
    return {"items": [_report_out(r, full=False) for r in rows]}


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: DB, user: User = perm):
    r = db.scalar(select(AIReport).where(AIReport.id == report_id, AIReport.user_id == user.id, AIReport.deleted_at.is_(None)))
    if r is None:
        raise not_found()
    return _report_out(r)


@router.delete("/reports/{report_id}")
def delete_report(report_id: int, db: DB, user: User = perm):
    r = db.scalar(select(AIReport).where(AIReport.id == report_id, AIReport.user_id == user.id))
    if r is None:
        raise not_found()
    db.delete(r)
    db.commit()
    return {"message": "Deleted."}


# ---------------- chat ----------------
def _conv_out(c: AIConversation, with_messages: bool) -> dict:
    d = {"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat()}
    if with_messages:
        d["messages"] = [{"id": m.id, "role": m.role, "content": m.content, "meta": m.meta, "created_at": m.created_at.isoformat()} for m in c.messages]
    return d


@router.post("/chat")
def ai_chat(body: ChatIn, db: DB, user: User = perm):
    if (body.start is None) != (body.end is None) or (body.start and body.end < body.start) or (body.start and (body.end - body.start).days > 366):
        raise bad_request("Provide both start and end (max one year), with end on or after start.")
    conv, reply = svc.chat(db, user, body.message, body.conversation_id, body.start, body.end, body.provider_id)
    return {"conversation": _conv_out(conv, False), "reply": {"id": reply.id, "role": "assistant", "content": reply.content, "meta": reply.meta, "created_at": reply.created_at.isoformat()}}


@router.get("/conversations")
def list_conversations(db: DB, user: User = perm):
    rows = db.scalars(select(AIConversation).where(AIConversation.user_id == user.id, AIConversation.deleted_at.is_(None)).order_by(AIConversation.updated_at.desc()).limit(100))
    return {"items": [_conv_out(c, False) for c in rows]}


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: int, db: DB, user: User = perm):
    c = db.scalar(select(AIConversation).where(AIConversation.id == conv_id, AIConversation.user_id == user.id, AIConversation.deleted_at.is_(None)))
    if c is None:
        raise not_found()
    return _conv_out(c, True)


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: int, db: DB, user: User = perm):
    c = db.scalar(select(AIConversation).where(AIConversation.id == conv_id, AIConversation.user_id == user.id))
    if c is None:
        raise not_found()
    db.delete(c)
    db.commit()
    return {"message": "Deleted."}


