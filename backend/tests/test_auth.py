import time
from datetime import timedelta

import jwt
import pytest
from sqlalchemy import select

from app.core import email as email_mod
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    validate_password_strength,
    verify_password,
    TokenError,
)
from app.models import AuditEvent, AuthSession, RefreshToken, User
from tests.conftest import PASSWORD, auth_headers, login, make_user, token_from_outbox

CSRF = "x-csrf-token"


def set_cookie(client, name, value, path):
    domain = "localhost.local"
    for c in [c for c in client.cookies.jar if c.name == name]:
        domain = c.domain
        client.cookies.jar.clear(c.domain, c.path, c.name)
    client.cookies.set(name, value, domain=domain, path=path)


def csrf_headers(client):
    return {CSRF: client.cookies.get("vt_csrf")}


# ---------- registration ----------
def test_register_creates_unverified_user_and_hashes_with_argon2id(client, db):
    r = client.post("/api/auth/register", json={"name": "Ann", "email": "Ann@Example.com", "password": PASSWORD, "confirm_password": PASSWORD})
    assert r.status_code == 201
    user = db.scalar(select(User).where(User.email == "ann@example.com"))
    assert user is not None and user.email_verified_at is None
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash
    assert user.role.name == "user"
    assert "password" not in r.text.lower().replace("password_", "")


def test_duplicate_email_rejected(client):
    make_user(client, "dup@example.com")
    r = client.post("/api/auth/register", json={"name": "X", "email": "DUP@example.com", "password": PASSWORD, "confirm_password": PASSWORD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


@pytest.mark.parametrize("pw", ["short1!A", "alllowercase1!", "ALLUPPERCASE1!", "NoDigitsHere!!", "NoSymbols12345"])
def test_weak_passwords_rejected(client, pw):
    r = client.post("/api/auth/register", json={"name": "Ann", "email": "w@example.com", "password": pw, "confirm_password": pw})
    assert r.status_code == 422 and r.json()["error"]["code"] == "weak_password"


def test_password_mismatch(client):
    r = client.post("/api/auth/register", json={"name": "Ann", "email": "m@example.com", "password": PASSWORD, "confirm_password": PASSWORD + "x"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "password_mismatch"


def test_registration_cannot_choose_role(client, db):
    r = client.post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": PASSWORD, "confirm_password": PASSWORD, "role": "admin", "role_id": 2})
    assert r.status_code == 201
    assert db.scalar(select(User).where(User.email == "eve@example.com")).role.name == "user"


def test_login_requires_verified_email(client):
    make_user(client, "unv@example.com", verify=False)
    r = login(client, "unv@example.com")
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_unverified"
    client.post("/api/auth/verify-email", json={"token": token_from_outbox("unv@example.com")})
    assert login(client, "unv@example.com").status_code == 200


def test_verification_token_single_use(client):
    make_user(client, "once@example.com", verify=False)
    t = token_from_outbox("once@example.com")
    assert client.post("/api/auth/verify-email", json={"token": t}).status_code == 200
    assert client.post("/api/auth/verify-email", json={"token": t}).status_code == 400


# ---------- password hashing ----------
def test_password_hash_roundtrip():
    h = hash_password("Correct!Horse9")
    assert h.startswith("$argon2id$")
    assert verify_password("Correct!Horse9", h)
    assert not verify_password("wrong", h)
    assert not verify_password("anything", None)


def test_strength_validator_flags_email_and_name():
    assert validate_password_strength("Johnsmith!123", "johnsmith@x.com")
    assert validate_password_strength("Str0ng!Passphrase", "a@b.com") == []


# ---------- login ----------
def test_login_success_sets_secure_cookies_and_no_refresh_in_body(client):
    make_user(client, "l@example.com")
    r = login(client, "l@example.com")
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and "refresh" not in r.text.replace("vt_refresh", "")
    sc = r.headers.get_list("set-cookie")
    refresh = next(c for c in sc if c.startswith("vt_refresh="))
    assert "HttpOnly" in refresh and "SameSite=strict" in refresh and "Path=/api/auth" in refresh
    csrf = next(c for c in sc if c.startswith("vt_csrf="))
    assert "HttpOnly" not in csrf


def test_login_errors_are_generic(client):
    make_user(client, "g@example.com")
    a = login(client, "g@example.com", "Wrong!Password1")
    b = login(client, "nobody@example.com", "Wrong!Password1")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_login_rate_limited(client):
    make_user(client, "rl@example.com")
    codes = [login(client, "rl@example.com", "Bad!Password123").status_code for _ in range(7)]
    assert codes[:5] == [401] * 5
    assert 429 in codes[5:]
    # correct password is also throttled during the lockout window
    assert login(client, "rl@example.com").status_code == 429


def test_audit_events_never_contain_secrets(client, db):
    make_user(client, "au@example.com")
    login(client, "au@example.com")
    for ev in db.scalars(select(AuditEvent)):
        blob = str(ev.detail)
        assert PASSWORD not in blob


# ---------- JWT ----------
def test_jwt_claims_and_validation(client, db):
    user = make_user(client, "j@example.com")
    r = login(client, "j@example.com")
    payload = decode_access_token(r.json()["access_token"])
    s = get_settings()
    assert payload["iss"] == s.jwt_issuer and payload["aud"] == s.jwt_audience
    assert payload["sub"] == str(user["id"]) and payload["typ"] == "access"
    assert payload["exp"] - payload["iat"] == s.access_token_minutes * 60


def test_jwt_rejects_none_alg_wrong_secret_aud_iss_and_expiry(client):
    s = get_settings()
    base = {"iss": s.jwt_issuer, "aud": s.jwt_audience, "sub": "1", "sid": "x", "typ": "access", "iat": int(time.time()), "exp": int(time.time()) + 60}
    good = jwt.encode(base, s.jwt_secret, algorithm="HS256")
    assert decode_access_token(good)["sub"] == "1"
    bad = {
        "none": jwt.encode(base, None, algorithm="none"),
        "secret": jwt.encode(base, "x" * 40, algorithm="HS256"),
        "aud": jwt.encode({**base, "aud": "other"}, s.jwt_secret, algorithm="HS256"),
        "iss": jwt.encode({**base, "iss": "other"}, s.jwt_secret, algorithm="HS256"),
        "alg": jwt.encode(base, s.jwt_secret, algorithm="HS512"),
        "typ": jwt.encode({**base, "typ": "refresh"}, s.jwt_secret, algorithm="HS256"),
        "nosub": jwt.encode({k: v for k, v in base.items() if k != "sub"}, s.jwt_secret, algorithm="HS256"),
    }
    for name, tok in bad.items():
        with pytest.raises(TokenError):
            decode_access_token(tok)
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401, name


def test_expired_token_rejected(client, db):
    user = make_user(client, "e@example.com")
    r = login(client, "e@example.com")
    sid = decode_access_token(r.json()["access_token"])["sid"]
    expired = create_access_token(user["id"], sid, "user", expires_delta=timedelta(seconds=-5))
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401 and resp.json()["error"]["code"] == "token_expired"


def test_protected_routes_require_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


# ---------- refresh rotation / revocation ----------
def test_refresh_requires_csrf(client):
    make_user(client, "c@example.com")
    login(client, "c@example.com")
    assert client.post("/api/auth/refresh").status_code == 403
    assert client.post("/api/auth/refresh", headers={CSRF: "wrong"}).status_code == 403
    assert client.post("/api/auth/refresh", headers={**csrf_headers(client), "origin": "http://evil.example"}).status_code == 403
    assert client.post("/api/auth/refresh", headers=csrf_headers(client)).status_code == 200


def test_refresh_rotates_and_reuse_revokes_session(client, db):
    make_user(client, "r@example.com")
    login(client, "r@example.com")
    old = client.cookies.get("vt_refresh", path="/api/auth")
    csrf = csrf_headers(client)
    r1 = client.post("/api/auth/refresh", headers=csrf)
    assert r1.status_code == 200
    new = client.cookies.get("vt_refresh", path="/api/auth")
    assert new and new != old
    access = r1.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"}).status_code == 200

    # Replay the already-rotated token after the grace window -> theft detected, whole session revoked.
    row = db.scalar(select(RefreshToken).where(RefreshToken.used_at.is_not(None)))
    row.used_at = row.used_at - timedelta(minutes=5)
    db.commit()
    set_cookie(client, "vt_refresh", old, "/api/auth")
    set_cookie(client, "vt_csrf", csrf[CSRF], "/")
    r2 = client.post("/api/auth/refresh", headers=csrf)
    assert r2.status_code == 401 and r2.json()["error"]["code"] == "refresh_token_reuse"
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"}).status_code == 401
    set_cookie(client, "vt_refresh", new, "/api/auth")
    set_cookie(client, "vt_csrf", csrf[CSRF], "/")
    assert client.post("/api/auth/refresh", headers=csrf).status_code == 401


def test_logout_revokes_refresh_session_and_access_token(client):
    make_user(client, "o@example.com")
    r = login(client, "o@example.com")
    access = {"Authorization": f"Bearer {r.json()['access_token']}"}
    stale = client.cookies.get("vt_refresh", path="/api/auth")
    csrf = csrf_headers(client)
    assert client.post("/api/auth/logout", headers=csrf).status_code == 200
    assert client.get("/api/auth/me", headers=access).status_code == 401
    set_cookie(client, "vt_refresh", stale, "/api/auth")
    set_cookie(client, "vt_csrf", csrf[CSRF], "/")
    assert client.post("/api/auth/refresh", headers=csrf).status_code == 401


def test_expired_refresh_token_rejected(client, db):
    make_user(client, "x@example.com")
    login(client, "x@example.com")
    row = db.scalar(select(RefreshToken))
    row.expires_at = row.expires_at - timedelta(days=30)
    db.commit()
    r = client.post("/api/auth/refresh", headers=csrf_headers(client))
    assert r.status_code == 401


def test_absolute_session_expiry(client, db):
    make_user(client, "abs@example.com")
    r = login(client, "abs@example.com")
    sess = db.scalar(select(AuthSession))
    sess.expires_at = sess.expires_at - timedelta(days=365)
    db.commit()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 401


def test_sessions_listing_and_revocation_are_owner_scoped(client, db):
    a = auth_headers(client, "sa@example.com")
    b = auth_headers(client, "sb@example.com")
    b_session = client.get("/api/auth/sessions", headers=b).json()[0]["id"]
    assert client.delete(f"/api/auth/sessions/{b_session}", headers=a).status_code == 404
    assert client.get("/api/auth/me", headers=b).status_code == 200
    assert client.delete(f"/api/auth/sessions/{b_session}", headers=b).status_code == 200
    assert client.get("/api/auth/me", headers=b).status_code == 401


def test_disabled_user_loses_access(client, db):
    h = auth_headers(client, "d@example.com")
    db.scalar(select(User).where(User.email == "d@example.com")).is_active = False
    db.commit()
    assert client.get("/api/auth/me", headers=h).status_code == 401


# ---------- password reset ----------
def test_forgot_password_does_not_reveal_accounts(client):
    make_user(client, "known@example.com")
    email_mod.OUTBOX.clear()
    a = client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    b = client.post("/api/auth/forgot-password", json={"email": "unknown@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()
    assert len(email_mod.OUTBOX) == 1


def test_reset_password_flow_single_use_and_revokes_sessions(client):
    h = auth_headers(client, "rp@example.com")
    client.post("/api/auth/forgot-password", json={"email": "rp@example.com"})
    t = token_from_outbox("rp@example.com")
    new_pw = "An0ther!Strong1"
    assert client.post("/api/auth/reset-password", json={"token": t, "password": "weak", "confirm_password": "weak"}).status_code == 422
    assert client.post("/api/auth/reset-password", json={"token": t, "password": new_pw, "confirm_password": new_pw}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": t, "password": new_pw, "confirm_password": new_pw}).status_code == 400
    assert client.get("/api/auth/me", headers=h).status_code == 401  # old sessions revoked
    assert login(client, "rp@example.com").status_code == 401
    assert login(client, "rp@example.com", new_pw).status_code == 200


def test_reset_token_expires(client, db):
    from app.models import EmailToken

    make_user(client, "ex@example.com")
    client.post("/api/auth/forgot-password", json={"email": "ex@example.com"})
    t = token_from_outbox("ex@example.com")
    tok = db.scalar(select(EmailToken).where(EmailToken.purpose == "reset"))
    tok.expires_at = tok.expires_at - timedelta(hours=3)
    db.commit()
    r = client.post("/api/auth/reset-password", json={"token": t, "password": "An0ther!Strong1", "confirm_password": "An0ther!Strong1"})
    assert r.status_code == 400


def test_reset_tokens_stored_hashed(client, db):
    from app.models import EmailToken

    make_user(client, "hh@example.com")
    client.post("/api/auth/forgot-password", json={"email": "hh@example.com"})
    t = token_from_outbox("hh@example.com")
    assert all(row.token_hash != t for row in db.scalars(select(EmailToken)))


def test_change_password_revokes_other_sessions(client):
    h = auth_headers(client, "cp@example.com")
    other = login(client, "cp@example.com").json()["access_token"]
    # `h` and `other` are separate sessions; change using `other`
    r = client.post("/api/auth/change-password", headers={"Authorization": f"Bearer {other}"}, json={"current_password": PASSWORD, "new_password": "N3w!Strong!Pass", "confirm_password": "N3w!Strong!Pass"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {other}"}).status_code == 200


def test_error_responses_hide_internals(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404 and "error" in r.json()
    r = client.post("/api/auth/login", json={"email": "bad"})
    assert r.status_code == 422 and "traceback" not in r.text.lower()


# ---------- verification disabled (local use without a mail server) ----------
def _no_verification(monkeypatch):
    monkeypatch.delenv("REQUIRE_EMAIL_VERIFICATION", raising=False)
    get_settings.cache_clear()


def test_signup_without_mail_integration_can_log_in_immediately(client, monkeypatch):
    _no_verification(monkeypatch)
    try:
        email_mod.OUTBOX.clear()
        r = client.post("/api/auth/register", json={"name": "Local", "email": "local@example.com", "password": PASSWORD, "confirm_password": PASSWORD})
        assert r.status_code == 201 and r.json()["verification_required"] is False and r.json()["user"]["email_verified"] is True
        assert email_mod.OUTBOX == []  # nothing to send
        assert login(client, "local@example.com").status_code == 200
    finally:
        monkeypatch.setenv("REQUIRE_EMAIL_VERIFICATION", "true")
        get_settings.cache_clear()


def test_existing_unverified_account_is_verified_at_login_when_disabled(client, monkeypatch):
    make_user(client, "old@example.com", verify=False)  # created while verification was required
    assert login(client, "old@example.com").status_code == 403
    _no_verification(monkeypatch)
    try:
        r = login(client, "old@example.com")
        assert r.status_code == 200
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 200
    finally:
        monkeypatch.setenv("REQUIRE_EMAIL_VERIFICATION", "true")
        get_settings.cache_clear()


def test_verification_required_automatically_with_smtp(monkeypatch):
    monkeypatch.delenv("REQUIRE_EMAIL_VERIFICATION", raising=False)
    monkeypatch.setenv("EMAIL_BACKEND", "smtp")
    get_settings.cache_clear()
    try:
        assert get_settings().verification_required is True
        monkeypatch.setenv("EMAIL_BACKEND", "file")
        get_settings.cache_clear()
        assert get_settings().verification_required is False
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
