import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

# Argon2id with OWASP-recommended minimum parameters (19 MiB, t=2, p=1) raised slightly.
_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
_DUMMY_HASH = _hasher.hash("veylotrace-dummy-password")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------- passwords ----------
_COMMON = {"password", "password1", "12345678", "123456789", "qwertyuiop", "iloveyou1", "letmein123"}


def validate_password_strength(password: str, email: str = "", name: str = "") -> list[str]:
    problems: list[str] = []
    if len(password) < 10:
        problems.append("Password must be at least 10 characters long.")
    if len(password) > 128:
        problems.append("Password must be at most 128 characters long.")
    if not re.search(r"[a-z]", password):
        problems.append("Password must contain a lowercase letter.")
    if not re.search(r"[A-Z]", password):
        problems.append("Password must contain an uppercase letter.")
    if not re.search(r"\d", password):
        problems.append("Password must contain a digit.")
    if not re.search(r"[^A-Za-z0-9]", password):
        problems.append("Password must contain a symbol.")
    low = password.lower()
    if low in _COMMON:
        problems.append("Password is too common.")
    local = email.split("@")[0].lower() if email else ""
    if local and len(local) >= 4 and local in low:
        problems.append("Password must not contain your email name.")
    if name and len(name) >= 4 and name.lower() in low:
        problems.append("Password must not contain your name.")
    return problems


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    """Constant-ish time: verifies against a dummy hash when the user doesn't exist."""
    try:
        return _hasher.verify(hashed or _DUMMY_HASH, password) and hashed is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    return _hasher.check_needs_rehash(hashed)


# ---------- opaque tokens ----------
def new_opaque_token(nbytes: int = 48) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# ---------- JWT ----------
class TokenError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def create_access_token(user_id: int, session_id: str, role: str, expires_delta: timedelta | None = None) -> str:
    s = get_settings()
    now = utcnow()
    exp = now + (expires_delta if expires_delta is not None else timedelta(minutes=s.access_token_minutes))
    payload = {
        "iss": s.jwt_issuer,
        "aud": s.jwt_audience,
        "sub": str(user_id),
        "sid": session_id,
        "role": role,
        "typ": "access",
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    s = get_settings()
    try:
        payload = jwt.decode(
            token,
            s.jwt_secret,
            algorithms=[s.jwt_algorithm],  # strict allowlist: rejects "none" and algorithm confusion
            audience=s.jwt_audience,
            issuer=s.jwt_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "sid"]},
        )
    except jwt.ExpiredSignatureError:
        raise TokenError("token_expired")
    except jwt.PyJWTError:
        raise TokenError("token_invalid")
    if payload.get("typ") != "access":
        raise TokenError("token_invalid")
    try:
        int(payload["sub"])
    except (TypeError, ValueError):
        raise TokenError("token_invalid")
    return payload


# ---------- encryption at rest ----------
class CryptoError(Exception):
    pass


def _fernet() -> Fernet:
    key = get_settings().encryption_key
    try:
        return Fernet(key.encode())
    except Exception as exc:  # noqa: BLE001
        raise CryptoError("ENCRYPTION_KEY is not a valid Fernet key") from exc


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise CryptoError("Stored credential cannot be decrypted with the current ENCRYPTION_KEY") from exc


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    return "••••••••" + value[-4:] if len(value) > 8 else "••••••••"
