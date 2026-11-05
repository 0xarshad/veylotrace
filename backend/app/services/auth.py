"""Authentication domain logic: registration, sessions, refresh-token rotation, password recovery."""

import uuid
from datetime import date, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import send_email
from app.core.errors import AppError, bad_request, conflict, unauthorized
from app.core.security import (
    create_access_token,
    ensure_aware,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    utcnow,
    validate_password_strength,
    verify_password,
)
from app.models import AuthSession, EmailToken, Permission, RefreshToken, Role, User, UserSettings, WeightLog
from app.services.audit import audit
from app.services.defaults import DEFAULT_TARGETS, DEFAULT_WIDGETS, seed_default_categories, suggested_nutrition_targets

ROLE_PERMISSIONS = {
    "user": {"tracking:own"},
    "admin": {"tracking:own", "admin:manage"},
}
PERMISSION_DESCRIPTIONS = {
    "tracking:own": "Read and write the user's own tracking data",
    "admin:manage": "Administer user accounts and view audit events",
}
EMAIL_TOKEN_HOURS = {"verify": 48, "reset": 1}
REFRESH_REUSE_GRACE_SECONDS = 5


def seed_roles(db: Session) -> None:
    perms = {p.code: p for p in db.scalars(select(Permission))}
    for code, desc in PERMISSION_DESCRIPTIONS.items():
        if code not in perms:
            perms[code] = Permission(code=code, description=desc)
            db.add(perms[code])
    roles = {r.name: r for r in db.scalars(select(Role))}
    for name, codes in ROLE_PERMISSIONS.items():
        role = roles.get(name) or Role(name=name)
        if name not in roles:
            db.add(role)
        role.permissions = [perms[c] for c in sorted(codes)]
    db.commit()


# ---------- registration / verification ----------
def _issue_email_token(db: Session, user: User, purpose: str) -> str:
    raw = new_opaque_token()
    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(raw),
            created_at=utcnow(),
            expires_at=utcnow() + timedelta(hours=EMAIL_TOKEN_HOURS[purpose]),
        )
    )
    return raw


def send_verification(db: Session, user: User) -> None:
    raw = _issue_email_token(db, user, "verify")
    db.commit()
    link = f"{get_settings().frontend_url}/verify-email?token={raw}"
    send_email(user.email, "Verify your VeyloTrace email", f"Hi {user.name},\n\nConfirm your email address:\n{link}\n\nThis link expires in 48 hours.")


def register_user(
    db: Session, name: str, email: str, password: str, confirm: str, ip: str,
    height_cm: float, weight_kg: float, body_fat_percent: float | None, target_weight_kg: float,
    sex_for_estimates: str, age_years: int, activity_level: str,
) -> User:
    if password != confirm:
        raise bad_request("Passwords do not match.", "password_mismatch")
    problems = validate_password_strength(password, email, name)
    if problems:
        raise AppError(422, "weak_password", "Password does not meet the requirements.", problems)
    if db.scalar(select(User.id).where(User.email == email)):
        raise conflict("An account with this email already exists.", "email_taken")
    role = db.scalar(select(Role).where(Role.name == "user"))  # public registration can only ever create "user"
    s = get_settings()
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        role_id=role.id,
        password_changed_at=utcnow(),
        email_verified_at=None if s.verification_required else utcnow(),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise conflict("An account with this email already exists.", "email_taken")
    db.add(UserSettings(
        user_id=user.id, dashboard_widgets=list(DEFAULT_WIDGETS),
        targets={**DEFAULT_TARGETS, **suggested_nutrition_targets(target_weight_kg, sex_for_estimates=sex_for_estimates, age_years=age_years, height_cm=height_cm, weight_kg=weight_kg, activity_level=activity_level)},
        height_cm=height_cm, starting_weight_kg=weight_kg, body_fat_percent=body_fat_percent,
        target_weight_kg=target_weight_kg, sex_for_estimates=sex_for_estimates, age_years=age_years, activity_level=activity_level,
    ))
    db.add(WeightLog(user_id=user.id, log_date=date.today(), weight_kg=weight_kg, body_fat_percent=body_fat_percent, notes="Starting measurement"))
    seed_default_categories(db, user.id)
    audit(db, "auth.register", user.id, ip)
    db.commit()
    if s.verification_required:
        send_verification(db, user)
    return user


def _consume_email_token(db: Session, raw: str, purpose: str) -> EmailToken:
    tok = db.scalar(select(EmailToken).where(EmailToken.token_hash == hash_token(raw), EmailToken.purpose == purpose))
    if tok is None or tok.used_at is not None or ensure_aware(tok.expires_at) <= utcnow():
        raise bad_request("This link is invalid or has expired.", "invalid_token")
    tok.used_at = utcnow()
    return tok


def verify_email(db: Session, raw: str, ip: str) -> None:
    tok = _consume_email_token(db, raw, "verify")
    user = db.get(User, tok.user_id)
    if user and user.email_verified_at is None:
        user.email_verified_at = utcnow()
    audit(db, "auth.email_verified", tok.user_id, ip)
    db.commit()


def resend_verification(db: Session, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email))
    if user and user.is_active and user.email_verified_at is None:
        send_verification(db, user)


# ---------- sessions ----------
def _create_refresh(db: Session, session: AuthSession) -> tuple[str, "RefreshToken"]:
    s = get_settings()
    raw = new_opaque_token()
    now = utcnow()
    expires = min(now + timedelta(days=s.refresh_token_days), ensure_aware(session.expires_at))
    row = RefreshToken(session_id=session.id, token_hash=hash_token(raw), created_at=now, expires_at=expires)
    db.add(row)
    return raw, row


def revoke_session(db: Session, session: AuthSession, reason: str) -> None:
    now = utcnow()
    if session.revoked_at is None:
        session.revoked_at = now
        session.revoked_reason = reason
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.session_id == session.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def revoke_all_sessions(db: Session, user_id: int, reason: str, except_session: str | None = None) -> None:
    for sess in db.scalars(select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))):
        if sess.id != except_session:
            revoke_session(db, sess, reason)


def login(db: Session, email: str, password: str, remember: bool, ip: str, user_agent: str):
    s = get_settings()
    user = db.scalar(select(User).where(User.email == email))
    now = utcnow()
    if user and user.locked_until and ensure_aware(user.locked_until) > now:
        verify_password(password, None)
        audit(db, "auth.login_blocked", user.id, ip)
        db.commit()
        raise AppError(429, "account_locked", "Too many failed attempts. Try again later.")
    ok = verify_password(password, user.password_hash if user else None)
    if not ok or user is None:
        if user:
            user.failed_login_count += 1
            if user.failed_login_count >= 10:
                user.locked_until = now + timedelta(minutes=15)
                user.failed_login_count = 0
        audit(db, "auth.login_failed", user.id if user else None, ip)
        db.commit()
        raise unauthorized("Invalid email or password.", "invalid_credentials")
    if not user.is_active:
        raise unauthorized("Invalid email or password.", "invalid_credentials")
    if user.email_verified_at is None and not s.verification_required:
        user.email_verified_at = now  # accounts created before verification was switched off
    if user.email_verified_at is None:
        raise AppError(403, "email_unverified", "Please verify your email address before signing in.")
    user.failed_login_count = 0
    user.locked_until = None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    lifetime = timedelta(days=s.session_absolute_days if remember else 1)
    session = AuthSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        created_at=now,
        last_used_at=now,
        expires_at=now + lifetime,
        user_agent=user_agent[:255],
        ip=ip[:64],
        remember=remember,
    )
    db.add(session)
    raw, _ = _create_refresh(db, session)
    audit(db, "auth.login", user.id, ip, session_id=session.id)
    db.commit()
    access = create_access_token(user.id, session.id, user.role.name)
    return user, session, access, raw


def refresh(db: Session, raw: str | None, ip: str):
    if not raw:
        raise unauthorized("No active session.", "no_refresh_token")
    now = utcnow()
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row is None:
        raise unauthorized("Session expired. Please sign in again.", "invalid_refresh_token")
    session = db.get(AuthSession, row.session_id)
    if session is None or session.revoked_at is not None or row.revoked_at is not None:
        raise unauthorized("Session expired. Please sign in again.", "session_revoked")
    if row.used_at is not None:
        # A rotated token was presented again: either a benign race or token theft.
        if (now - ensure_aware(row.used_at)).total_seconds() <= REFRESH_REUSE_GRACE_SECONDS:
            raise AppError(409, "refresh_race", "Refresh already in progress; retry.")
        revoke_session(db, session, "refresh_token_reuse")
        audit(db, "auth.refresh_reuse_detected", session.user_id, ip, session_id=session.id)
        db.commit()
        raise unauthorized("Session expired. Please sign in again.", "refresh_token_reuse")
    if ensure_aware(row.expires_at) <= now or ensure_aware(session.expires_at) <= now:
        revoke_session(db, session, "expired")
        db.commit()
        raise unauthorized("Session expired. Please sign in again.", "session_expired")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        revoke_session(db, session, "account_disabled")
        db.commit()
        raise unauthorized("Account unavailable.", "account_disabled")
    # Atomic single-use claim guards against concurrent rotation.
    claimed = db.execute(
        update(RefreshToken).where(RefreshToken.id == row.id, RefreshToken.used_at.is_(None)).values(used_at=now)
    ).rowcount
    if claimed != 1:
        db.rollback()
        raise AppError(409, "refresh_race", "Refresh already in progress; retry.")
    new_raw, _ = _create_refresh(db, session)
    session.last_used_at = now
    db.commit()
    return user, session, create_access_token(user.id, session.id, user.role.name), new_raw


def logout_by_refresh(db: Session, raw: str | None, ip: str) -> None:
    if not raw:
        return
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row:
        session = db.get(AuthSession, row.session_id)
        if session and session.revoked_at is None:
            revoke_session(db, session, "logout")
            audit(db, "auth.logout", session.user_id, ip, session_id=session.id)
            db.commit()


# ---------- password recovery ----------
def request_password_reset(db: Session, email: str, ip: str) -> None:
    """Always behaves identically to the caller whether or not the account exists."""
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active:
        return
    for old in db.scalars(select(EmailToken).where(EmailToken.user_id == user.id, EmailToken.purpose == "reset", EmailToken.used_at.is_(None))):
        old.used_at = utcnow()
    raw = _issue_email_token(db, user, "reset")
    audit(db, "auth.password_reset_requested", user.id, ip)
    db.commit()
    link = f"{get_settings().frontend_url}/reset-password?token={raw}"
    send_email(user.email, "Reset your VeyloTrace password", f"Use this link to choose a new password (valid for 1 hour, single use):\n{link}\n\nIf you did not request this, ignore this email.")


def reset_password(db: Session, raw: str, password: str, confirm: str, ip: str) -> None:
    if password != confirm:
        raise bad_request("Passwords do not match.", "password_mismatch")
    tok = db.scalar(select(EmailToken).where(EmailToken.token_hash == hash_token(raw), EmailToken.purpose == "reset"))
    if tok is None or tok.used_at is not None or ensure_aware(tok.expires_at) <= utcnow():
        raise bad_request("This link is invalid or has expired.", "invalid_token")
    user = db.get(User, tok.user_id)
    problems = validate_password_strength(password, user.email, user.name)
    if problems:
        raise AppError(422, "weak_password", "Password does not meet the requirements.", problems)
    tok.used_at = utcnow()
    user.password_hash = hash_password(password)
    user.password_changed_at = utcnow()
    user.failed_login_count = 0
    user.locked_until = None
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()  # receiving the reset email proves mailbox ownership
    revoke_all_sessions(db, user.id, "password_reset")
    audit(db, "auth.password_reset", user.id, ip)
    db.commit()


def change_password(db: Session, user: User, current: str, new: str, confirm: str, keep_session: str, ip: str) -> None:
    if not verify_password(current, user.password_hash):
        raise bad_request("Current password is incorrect.", "invalid_credentials")
    if new != confirm:
        raise bad_request("Passwords do not match.", "password_mismatch")
    problems = validate_password_strength(new, user.email, user.name)
    if problems:
        raise AppError(422, "weak_password", "Password does not meet the requirements.", problems)
    user.password_hash = hash_password(new)
    user.password_changed_at = utcnow()
    revoke_all_sessions(db, user.id, "password_change", except_session=keep_session)
    audit(db, "auth.password_changed", user.id, ip)
    db.commit()
