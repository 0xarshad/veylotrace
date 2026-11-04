from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.models import AuditEvent

_SENSITIVE = ("password", "token", "secret", "api_key", "authorization", "cookie")


def _clean(detail: dict) -> dict:
    return {k: ("[redacted]" if any(s in k.lower() for s in _SENSITIVE) else v) for k, v in detail.items()}


def audit(db: Session, action: str, user_id: int | None = None, ip: str = "", **detail) -> None:
    db.add(AuditEvent(user_id=user_id, action=action, ip=ip[:64], detail=_clean(detail), created_at=utcnow()))
