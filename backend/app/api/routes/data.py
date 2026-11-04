from datetime import date

from fastapi import APIRouter, Body, Depends, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core import cookies
from app.core.deps import DB, CurrentUser, client_ip, require_permission
from app.core.errors import bad_request
from app.core.ratelimit import limiter
from app.core.security import verify_password
from app.models import User
from app.services import backup as bk
from app.services import portability as port
from app.services import data_reset as reset
from app.services.audit import audit

perm = Depends(require_permission("tracking:own"))
router = APIRouter(prefix="/data", tags=["data"], dependencies=[perm])
admin = APIRouter(prefix="/admin/backups", tags=["admin"], dependencies=[Depends(require_permission("admin:manage"))])


@router.get("/export")
def export_all(request: Request, db: DB, user: User = perm, include_deleted: bool = False):
    limiter.check(f"export:{user.id}", 10, 60)
    import json

    payload = port.export_user(db, user.id, include_deleted)
    audit(db, "data.export", user.id, client_ip(request))
    db.commit()
    return Response(json.dumps(payload), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="veylotrace-export-{date.today()}.json"'})


@router.get("/export/csv/{table}")
def export_csv(table: str, db: DB, user: User = perm):
    limiter.check(f"export:{user.id}", 30, 60)
    return Response(port.export_csv(db, user.id, table), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="veylotrace-{table}-{date.today()}.csv"'})


@router.get("/export/tables")
def export_tables():
    return sorted(port.BY_TABLE)


class ResetDataIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sections: list[str] = Field(min_length=1, max_length=9)
    start: date | None = None
    end: date | None = None
    confirm: str | None = None


@router.post("/reset")
def reset_data(body: ResetDataIn, request: Request, db: DB, user: User = perm, dry_run: bool = Query(True)):
    """Preview by default; permanent resets require an explicit typed confirmation."""
    limiter.check(f"reset:{user.id}", 10, 60)
    if not dry_run and body.confirm != "RESET":
        raise bad_request('Type "RESET" to confirm this permanent data reset.', "confirmation_required")
    result = reset.reset_user_data(db, user.id, body.sections, body.start, body.end, dry_run=dry_run)
    if not dry_run:
        audit(db, "data.reset", user.id, client_ip(request), sections=result["sections"], start=result["start"], end=result["end"], total=result["total"])
        db.commit()
    else:
        db.rollback()
    return result


@router.post("/import")
def import_data(request: Request, db: DB, user: User = perm, payload: dict = Body(...), dry_run: bool = Query(True)):
    """Dry-run by default: the UI previews counts (imported / duplicates / invalid) before committing."""
    limiter.check(f"import:{user.id}", 10, 60)
    result = port.import_user(db, user.id, payload, dry_run=dry_run)
    if not dry_run:
        audit(db, "data.import", user.id, client_ip(request), totals=result["totals"])
        db.commit()
    return result


class DeleteAccountIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(max_length=128)


@router.delete("/account")
def delete_account(body: DeleteAccountIn, request: Request, response: Response, db: DB, user: CurrentUser):
    if not verify_password(body.password, user.password_hash):
        raise bad_request("Password is incorrect.", "invalid_credentials")
    admins = db.scalars(select(User).where(User.role_id == user.role_id, User.is_active.is_(True))).all()
    if user.role.name == "admin" and len(admins) <= 1:
        raise bad_request("You are the only administrator; promote another admin first.", "last_admin")
    audit(db, "account.deleted", None, client_ip(request), email_domain=user.email.split("@")[-1])
    db.delete(user)
    db.commit()
    cookies.clear_auth_cookies(response)
    return {"message": "Account and all associated data were permanently deleted."}


# ---------------- admin: database backups ----------------
class RestoreIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: str


@admin.get("")
def list_backups():
    return {"items": bk.list_backups()}


@admin.post("", status_code=201)
def create_backup(request: Request, db: DB, me: User = Depends(require_permission("admin:manage"))):
    meta = bk.create_backup("manual")
    audit(db, "backup.created", me.id, client_ip(request), name=meta["name"])
    db.commit()
    return meta


@admin.post("/{name}/verify")
def verify_backup(name: str):
    return bk.verify_backup(name)


@admin.get("/{name}/download")
def download_backup(name: str):
    return FileResponse(bk.backup_path(name), media_type="application/octet-stream", filename=name)


@admin.post("/{name}/restore")
def restore_backup(name: str, body: RestoreIn, request: Request, db: DB, me: User = Depends(require_permission("admin:manage"))):
    if body.confirm != "RESTORE":
        raise bad_request('Type "RESTORE" to confirm.', "confirmation_required")
    audit(db, "backup.restore_requested", me.id, client_ip(request), name=name)
    db.commit()
    return bk.restore_backup(name)


@admin.delete("/{name}")
def delete_backup(name: str, request: Request, db: DB, me: User = Depends(require_permission("admin:manage"))):
    bk.delete_backup(name)
    audit(db, "backup.deleted", me.id, client_ip(request), name=name)
    db.commit()
    return {"message": "Backup deleted."}
