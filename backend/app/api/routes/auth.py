from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.core import cookies
from app.core.config import get_settings
from app.core.deps import DB, CurrentUser, client_ip
from app.core.errors import AppError, not_found
from app.core.ratelimit import limiter
from app.models import AuthSession
from app.schemas.auth import (
    AuthOut,
    ChangePasswordIn,
    EmailIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    SessionOut,
    TokenIn,
    UserOut,
)
from app.services import auth as svc
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_ACCEPTED = {"message": "If the address is registered, an email has been sent."}


def user_out(user) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.name,
        email_verified=user.email_verified_at is not None,
        created_at=user.created_at,
    )


def _auth_response(response: Response, user, session, access: str, raw_refresh: str) -> AuthOut:
    cookies.set_auth_cookies(response, raw_refresh, persistent=session.remember)
    return AuthOut(access_token=access, expires_in=get_settings().access_token_minutes * 60, user=user_out(user))


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: DB):
    s = get_settings()
    ip = client_ip(request)
    limiter.check(f"register:{ip}", 10, 3600, "Too many sign-ups from this address.")
    user = svc.register_user(
        db, body.name, body.email, body.password, body.confirm_password, ip,
        body.height_cm, body.weight_kg, body.body_fat_percent, body.target_weight_kg,
        body.sex_for_estimates, body.age_years, body.activity_level,
    )
    required = s.verification_required
    msg = "Account created. Check your email to verify your address." if required else "Account created. You can sign in now."
    return {"message": msg, "verification_required": required, "user": user_out(user)}


@router.post("/verify-email")
def verify_email(body: TokenIn, request: Request, db: DB):
    limiter.check(f"verify:{client_ip(request)}", 20, 600)
    svc.verify_email(db, body.token, client_ip(request))
    return {"message": "Email verified. You can now sign in."}


@router.post("/resend-verification", status_code=202)
def resend_verification(body: EmailIn, request: Request, db: DB):
    ip = client_ip(request)
    limiter.check(f"resend:{ip}", 5, 3600)
    limiter.check(f"resend:{body.email}", 3, 3600)
    svc.resend_verification(db, body.email)
    return GENERIC_ACCEPTED


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, request: Request, response: Response, db: DB):
    s = get_settings()
    ip = client_ip(request)
    # Throttle per (ip, email) and per ip; failures AND successes count, which keeps brute force expensive.
    limiter.check(f"login:{ip}:{body.email}", s.login_rate_limit, s.login_rate_window_seconds, "Too many login attempts. Try again later.")
    limiter.check(f"login-ip:{ip}", s.login_rate_limit * 6, s.login_rate_window_seconds, "Too many login attempts. Try again later.")
    user, session, access, raw = svc.login(db, body.email, body.password, body.remember, ip, request.headers.get("user-agent", ""))
    return _auth_response(response, user, session, access, raw)


@router.post("/refresh", response_model=AuthOut)
def refresh(request: Request, response: Response, db: DB):
    cookies.verify_csrf(request)
    ip = client_ip(request)
    limiter.check(f"refresh:{ip}", 60, 60)
    raw = request.cookies.get(cookies.REFRESH_COOKIE)
    try:
        user, session, access, new_raw = svc.refresh(db, raw, ip)
    except AppError as exc:
        if exc.code == "refresh_race":
            raise
        resp = JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status, headers=exc.headers)
        cookies.clear_auth_cookies(resp)
        return resp
    return _auth_response(response, user, session, access, new_raw)


@router.post("/logout")
def logout(request: Request, response: Response, db: DB):
    cookies.verify_csrf(request)
    svc.logout_by_refresh(db, request.cookies.get(cookies.REFRESH_COOKIE), client_ip(request))
    cookies.clear_auth_cookies(response)
    return {"message": "Signed out."}


@router.post("/logout-all")
def logout_all(request: Request, response: Response, db: DB, user: CurrentUser):
    svc.revoke_all_sessions(db, user.id, "logout_all")
    audit(db, "auth.logout_all", user.id, client_ip(request))
    db.commit()
    cookies.clear_auth_cookies(response)
    return {"message": "Signed out of all devices."}


@router.post("/forgot-password", status_code=202)
def forgot_password(body: EmailIn, request: Request, db: DB):
    ip = client_ip(request)
    limiter.check(f"forgot:{ip}", 10, 3600)
    limiter.check(f"forgot:{body.email}", 3, 3600)
    svc.request_password_reset(db, body.email, ip)
    return GENERIC_ACCEPTED


@router.post("/reset-password")
def reset_password(body: ResetPasswordIn, request: Request, db: DB):
    limiter.check(f"reset:{client_ip(request)}", 10, 3600)
    svc.reset_password(db, body.token, body.password, body.confirm_password, client_ip(request))
    return {"message": "Password updated. Please sign in."}


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request, db: DB, user: CurrentUser):
    svc.change_password(db, user, body.current_password, body.new_password, body.confirm_password, request.state.session_id, client_ip(request))
    return {"message": "Password changed. Other devices were signed out."}


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user_out(user)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(request: Request, db: DB, user: CurrentUser):
    rows = db.scalars(
        select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).order_by(AuthSession.last_used_at.desc())
    )
    return [
        SessionOut(id=r.id, created_at=r.created_at, last_used_at=r.last_used_at, user_agent=r.user_agent, ip=r.ip, current=r.id == request.state.session_id)
        for r in rows
    ]


@router.delete("/sessions/{session_id}")
def revoke_one(session_id: str, request: Request, db: DB, user: CurrentUser):
    sess = db.scalar(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id))
    if sess is None:
        raise not_found("Session not found.")
    svc.revoke_session(db, sess, "revoked_by_user")
    audit(db, "auth.session_revoked", user.id, client_ip(request), session_id=session_id)
    db.commit()
    return {"message": "Session revoked."}
