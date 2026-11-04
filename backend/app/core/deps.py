from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import forbidden, unauthorized
from app.core.security import TokenError, decode_access_token, ensure_aware, utcnow
from app.db.session import get_db
from app.models import AuthSession, User

DB = Annotated[Session, Depends(get_db)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def get_current_user(request: Request, db: DB) -> User:
    """Identity comes ONLY from the verified JWT + a live, non-revoked server-side session."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise unauthorized()
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise unauthorized("Your session has expired." if exc.code == "token_expired" else "Invalid credentials.", exc.code)
    session = db.get(AuthSession, payload["sid"])
    now = utcnow()
    if (
        session is None
        or session.revoked_at is not None
        or ensure_aware(session.expires_at) <= now
        or str(session.user_id) != payload["sub"]
    ):
        raise unauthorized("Session is no longer valid.", "session_revoked")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise unauthorized("Account unavailable.", "account_disabled")
    if user.email_verified_at is None:
        raise unauthorized("Email address is not verified.", "email_unverified")
    request.state.user_id = user.id
    request.state.session_id = session.id
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(code: str) -> Callable[..., User]:
    def dep(user: CurrentUser) -> User:
        if code not in user.permission_codes:
            raise forbidden()
        return user

    return dep


def require_admin() -> Callable[..., User]:
    return require_permission("admin:manage")
