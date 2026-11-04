import os
import re

from cryptography.fernet import Fernet

os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": "sqlite://",
        "JWT_SECRET": "test-secret-test-secret-test-secret-1234567890",
        "ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "EMAIL_BACKEND": "memory",
        "REQUIRE_EMAIL_VERIFICATION": "true",
        "CORS_ORIGINS": "http://localhost:5173",
        "GENERAL_RATE_LIMIT_PER_MINUTE": "100000",
        "LOGIN_RATE_LIMIT": "5",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import email as email_mod  # noqa: E402
from app.core.ratelimit import limiter  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.auth import seed_roles  # noqa: E402

PASSWORD = "Str0ng!Passphrase"


@pytest.fixture()
def db_engine():
    engine = db_session.init_engine("sqlite://")
    Base.metadata.create_all(engine)
    with db_session.SessionLocal() as db:
        seed_roles(db)
    yield engine
    engine.dispose()


@pytest.fixture()
def client(db_engine):
    limiter.reset()
    email_mod.OUTBOX.clear()
    with TestClient(create_app(), base_url="http://localhost") as c:
        yield c


@pytest.fixture()
def db(db_engine):
    with db_session.SessionLocal() as session:
        yield session


def token_from_outbox(to: str, key: str = "token") -> str:
    for mail in reversed(email_mod.OUTBOX):
        if mail["to"] == to:
            m = re.search(rf"{key}=([\w\-]+)", mail["body"])
            if m:
                return m.group(1)
    raise AssertionError(f"no email to {to}")


def make_user(client: TestClient, email: str, name: str = "Test User", password: str = PASSWORD, verify: bool = True):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password, "confirm_password": password})
    assert r.status_code == 201, r.text
    if verify:
        t = token_from_outbox(email)
        assert client.post("/api/auth/verify-email", json={"token": t}).status_code == 200
    return r.json()["user"]


def login(client: TestClient, email: str, password: str = PASSWORD, remember: bool = True):
    return client.post("/api/auth/login", json={"email": email, "password": password, "remember": remember})


def auth_headers(client: TestClient, email: str) -> dict:
    """Registers (if needed), verifies and logs in on a *separate* client so cookies stay isolated."""
    make_user(client, email)
    r = login(client, email)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def user_a(client):
    return auth_headers(client, "a@example.com")


@pytest.fixture()
def user_b(client):
    return auth_headers(client, "b@example.com")
