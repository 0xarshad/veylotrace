from fastapi import Request, Response

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import new_opaque_token, safe_equal

REFRESH_COOKIE = "vt_refresh"
CSRF_COOKIE = "vt_csrf"
CSRF_HEADER = "x-csrf-token"
REFRESH_PATH = "/api/auth"


def set_auth_cookies(response: Response, refresh_token: str, persistent: bool) -> None:
    s = get_settings()
    max_age = s.refresh_token_days * 86400 if persistent else None
    response.set_cookie(
        REFRESH_COOKIE, refresh_token, max_age=max_age, httponly=True, secure=s.cookie_secure,
        samesite=s.cookie_samesite, path=REFRESH_PATH,
    )
    # Double-submit CSRF token: readable by the SPA, which echoes it in the X-CSRF-Token header.
    response.set_cookie(
        CSRF_COOKIE, new_opaque_token(24), max_age=max_age, httponly=False, secure=s.cookie_secure,
        samesite=s.cookie_samesite, path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)
    response.delete_cookie(CSRF_COOKIE, path="/")


def verify_csrf(request: Request) -> None:
    """Required on cookie-authenticated state-changing endpoints (refresh / logout)."""
    s = get_settings()
    origin = request.headers.get("origin")
    if origin and origin not in s.cors_origin_list:
        raise AppError(403, "csrf_origin", "Request origin is not allowed.")
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not header or not safe_equal(cookie, header):
        raise AppError(403, "csrf_failed", "CSRF validation failed.")
