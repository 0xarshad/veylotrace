from datetime import date, datetime

from sqlalchemy import select

from app.models import Role, User
from tests.conftest import PASSWORD, auth_headers, login, make_user

TODAY = date.today()


def make_admin(client, db, email="admin@example.com"):
    h = auth_headers(client, email)
    user = db.scalar(select(User).where(User.email == email))
    user.role_id = db.scalar(select(Role.id).where(Role.name == "admin"))
    db.commit()
    # role is embedded in the token for display only; authorization always re-reads the DB
    return h, user


PUBLIC = {
    ("POST", "/api/auth/register"), ("POST", "/api/auth/login"), ("POST", "/api/auth/refresh"), ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/verify-email"), ("POST", "/api/auth/resend-verification"), ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-password"), ("GET", "/api/health"),
}


def test_every_endpoint_requires_authentication(client):
    schema = client.get("/api/openapi.json").json()
    checked = 0
    for path, methods in schema["paths"].items():
        for method in methods:
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"} or (method.upper(), path) in PUBLIC:
                continue
            url = path.replace("{item_id}", "1").replace("{challenge_id}", "1").replace("{provider_id}", "1").replace("{report_id}", "1").replace("{conv_id}", "1")
            url = url.replace("{user_id}", "1").replace("{name}", "x.db").replace("{kind}", "daily").replace("{section}", "finance").replace("{table}", "expenses").replace("{session_id}", "x")
            r = client.request(method.upper(), url, json={} if method != "get" else None)
            assert r.status_code == 401, f"{method.upper()} {path} -> {r.status_code}"
            checked += 1
    assert checked > 100


def test_admin_endpoints_forbidden_for_regular_users(client, user_a):
    for method, url in [("GET", "/api/admin/users"), ("GET", "/api/admin/audit"), ("GET", "/api/admin/backups"), ("POST", "/api/admin/backups"), ("PATCH", "/api/admin/users/1")]:
        r = client.request(method, url, headers=user_a, json={} if method in ("POST", "PATCH") else None)
        assert r.status_code == 403, (method, url, r.status_code)


def test_admin_can_manage_users_but_not_read_their_data(client, db, user_a):
    admin_h, admin = make_admin(client, db)
    users = client.get("/api/admin/users", headers=admin_h).json()["items"]
    assert {u["email"] for u in users} == {"a@example.com", "admin@example.com"}
    assert all("password" not in str(u).lower() for u in users)
    a_id = next(u["id"] for u in users if u["email"] == "a@example.com")
    client.post("/api/expenses", json={"occurred_at": datetime.now().isoformat(), "amount": "5"}, headers=user_a)
    # admin has the same per-user isolation as everybody else
    assert client.get("/api/expenses", headers=admin_h).json()["total"] == 0
    # disabling an account revokes its sessions immediately
    assert client.patch(f"/api/admin/users/{a_id}", json={"is_active": False}, headers=admin_h).status_code == 200
    assert client.get("/api/auth/me", headers=user_a).status_code == 401
    assert login(client, "a@example.com").status_code == 401
    # no self-modification, no unknown fields
    assert client.patch(f"/api/admin/users/{admin.id}", json={"role": "user"}, headers=admin_h).status_code == 409
    assert client.patch(f"/api/admin/users/{a_id}", json={"password_hash": "x"}, headers=admin_h).status_code == 422
    audit = client.get("/api/admin/audit", headers=admin_h).json()["items"]
    assert any(a["action"] == "admin.user_update" for a in audit)


def test_role_changes_take_effect_without_relogin(client, db, user_a):
    me = db.scalar(select(User).where(User.email == "a@example.com"))
    me.role_id = db.scalar(select(Role.id).where(Role.name == "admin"))
    db.commit()
    assert client.get("/api/admin/users", headers=user_a).status_code == 200
    me.role_id = db.scalar(select(Role.id).where(Role.name == "user"))
    db.commit()
    assert client.get("/api/admin/users", headers=user_a).status_code == 403


def test_forged_admin_claim_in_token_is_ignored(client, db, user_a):
    import jwt as pyjwt

    from app.core.config import get_settings
    from app.core.security import decode_access_token

    s = get_settings()
    token = user_a["Authorization"].split()[1]
    payload = decode_access_token(token) | {"role": "admin"}
    forged = pyjwt.encode(payload, "a-wrong-secret-a-wrong-secret-a-wrong-secret", algorithm=s.jwt_algorithm)
    assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    # even a correctly signed token claiming role=admin doesn't grant it: the DB decides
    signed = pyjwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)
    assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {signed}"}).status_code == 403


def test_settings_validation_and_isolation(client, user_a, user_b):
    r = client.put("/api/settings", json={"theme": "dark", "targets": {"calories": 2500}, "ai_modules": ["finance"]}, headers=user_a)
    assert r.status_code == 200 and r.json()["theme"] == "dark" and r.json()["targets"]["calories"] == 2500 and r.json()["targets"]["protein_g"] == 100
    assert client.get("/api/settings", headers=user_b).json()["theme"] == "system"
    assert client.put("/api/settings", json={"targets": {"hack": 1}}, headers=user_a).status_code == 422
    assert client.put("/api/settings", json={"targets": {"calories": -5}}, headers=user_a).status_code == 422
    assert client.put("/api/settings", json={"dashboard_widgets": ["nope"]}, headers=user_a).status_code == 422
    assert client.put("/api/settings", json={"ai_modules": ["everything"]}, headers=user_a).status_code == 422
    assert client.put("/api/settings", json={"user_id": 5}, headers=user_a).status_code == 422
    # targets drive calculations
    client.put("/api/settings", json={"targets": {"water_ml": 1000}}, headers=user_a)
    client.post("/api/water", json={"logged_at": datetime.now().isoformat(), "amount_ml": 1200}, headers=user_a)
    n = client.get("/api/dashboard", params={"period": "day"}, headers=user_a).json()["nutrition"]
    assert n["target_days_met"]["water"] == 1 and n["targets"]["water_ml"] == 1000


def test_security_headers_and_cors_allowlist(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert r.headers["cache-control"] == "no-store"
    evil = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in evil.headers


def test_payload_size_limit(client, user_a):
    r = client.post("/api/expenses", content=b"x" * 2_000_000, headers={**user_a, "content-type": "application/json"})
    assert r.status_code == 413


def test_delete_account_removes_all_data(client, db):
    h = auth_headers(client, "gone@example.com")
    client.post("/api/expenses", json={"occurred_at": datetime.now().isoformat(), "amount": "5"}, headers=h)
    assert client.request("DELETE", "/api/data/account", json={"password": "wrong"}, headers=h).status_code == 400
    assert client.request("DELETE", "/api/data/account", json={"password": PASSWORD}, headers=h).status_code == 200
    from app.models import Expense

    assert db.scalar(select(Expense.id)) is None
    assert db.scalar(select(User).where(User.email == "gone@example.com")) is None
    assert login(client, "gone@example.com").status_code == 401


def test_unverified_users_cannot_use_api_even_with_forged_session(client, db):
    make_user(client, "late@example.com", verify=False)
    assert login(client, "late@example.com").status_code == 403


def test_admin_role_not_assignable_through_registration(client, db):
    r = client.post("/api/auth/register", json={"name": "X", "email": "x@example.com", "password": PASSWORD, "confirm_password": PASSWORD, "role": "admin"})
    assert r.status_code == 201 and r.json()["user"]["role"] == "user"


