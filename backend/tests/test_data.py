import json
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.ratelimit import limiter
from app.db import session as db_session
from app.db.base import Base
from app.main import create_app
from app.services.auth import seed_roles
from tests.test_authorization import make_admin

NOW = datetime.now().replace(microsecond=0)
TODAY = date.today()


def seed(client, h):
    cat = client.post("/api/expense-categories", json={"name": "Pets"}, headers=h).json()
    sub = client.post("/api/expense-categories", json={"name": "Vet", "parent_id": cat["id"]}, headers=h).json()
    client.post("/api/expenses", json={"occurred_at": NOW.isoformat(), "amount": "42.50", "category_id": cat["id"], "subcategory_id": sub["id"], "description": "Checkup"}, headers=h)
    food = client.post("/api/foods", json={"name": "Egg", "calories": 70}, headers=h).json()
    client.post("/api/meals", json={"meal_type": "lunch", "eaten_at": NOW.isoformat(), "items": [{"name": "Egg", "food_item_id": food["id"], "quantity": 2, "calories": 70}]}, headers=h)
    client.post("/api/workouts", json={"kind": "gym", "performed_at": NOW.isoformat(), "duration_min": 30, "exercises": [{"name": "Squat", "sets": 3, "reps": 5, "weight_kg": 80}]}, headers=h)
    book = client.post("/api/books", json={"title": "Dune", "total_pages": 400}, headers=h).json()
    client.post("/api/reading", json={"read_at": NOW.isoformat(), "book_id": book["id"], "pages": 30}, headers=h)
    g = client.post("/api/goals", json={"name": "Goal", "milestones": [{"title": "m", "completed": True}]}, headers=h).json()
    client.post("/api/tasks", json={"name": "T", "goal_id": g["id"]}, headers=h)
    client.post("/api/challenges", json={"name": "C", "metric": "manual", "start_date": TODAY.isoformat()}, headers=h)
    client.post("/api/steps", json={"log_date": TODAY.isoformat(), "steps": 5000}, headers=h)


def counts(client, h):
    out = {}
    for res in ("expense-categories", "expenses", "foods", "meals", "workouts", "books", "reading", "goals", "tasks", "challenges", "steps"):
        out[res] = client.get(f"/api/{res}", headers=h).json()["total"]
    return out


def test_full_export_import_roundtrip_with_relations_and_duplicate_detection(client, user_a, user_b):
    seed(client, user_a)
    exported = client.get("/api/data/export", headers=user_a)
    assert exported.status_code == 200 and "attachment" in exported.headers["content-disposition"]
    data = exported.json()
    assert data["format"] == "veylotrace-export" and len(data["tables"]["expenses"]) == 1
    blob = json.dumps(data)
    assert "api_key" not in blob and "password" not in blob  # credentials are never part of an export

    before = counts(client, user_b)
    dry = client.post("/api/data/import", json=data, headers=user_b).json()
    assert dry["dry_run"] is True and dry["totals"]["imported"] > 0 and counts(client, user_b) == before  # dry-run writes nothing
    real = client.post("/api/data/import", params={"dry_run": "false"}, json=data, headers=user_b).json()
    # the 3 default categories every account starts with are recognised as duplicates, not re-created
    assert real["totals"]["invalid"] == 0 and real["totals"]["duplicates"] == 3
    assert counts(client, user_b) == counts(client, user_a)

    # relations were remapped to *user B's* new ids, never A's
    exp_b = client.get("/api/expenses", headers=user_b).json()["items"][0]
    cat_names = {c["id"]: c["name"] for c in client.get("/api/expense-categories", headers=user_b).json()["items"]}
    assert cat_names[exp_b["category_id"]] == "Pets" and cat_names[exp_b["subcategory_id"]] == "Vet"
    meal = client.get("/api/meals", headers=user_b).json()["items"][0]
    assert meal["totals"]["calories"] == 140 and meal["items"][0]["food_item_id"] in {f["id"] for f in client.get("/api/foods", headers=user_b).json()["items"]}
    book_b = client.get("/api/books", headers=user_b).json()["items"][0]
    assert book_b["pages_read"] == 30
    assert client.get("/api/goals", headers=user_b).json()["items"][0]["milestones"][0]["completed"] is True

    # importing again is fully de-duplicated
    again = client.post("/api/data/import", params={"dry_run": "false"}, json=data, headers=user_b).json()
    assert again["totals"]["imported"] == 0 and again["totals"]["duplicates"] > 0
    assert client.get("/api/expenses", headers=user_b).json()["total"] == 1
    # user A is untouched
    assert client.get("/api/expenses", headers=user_a).json()["total"] == 1


def test_import_into_same_account_is_idempotent(client, user_a):
    seed(client, user_a)
    data = client.get("/api/data/export", headers=user_a).json()
    before = counts(client, user_a)
    res = client.post("/api/data/import", params={"dry_run": "false"}, json=data, headers=user_a).json()
    assert res["totals"]["imported"] == 0 and counts(client, user_a) == before


def test_restore_after_deleting_everything(client, user_a):
    seed(client, user_a)
    data = client.get("/api/data/export", headers=user_a).json()
    for e in client.get("/api/expenses", headers=user_a).json()["items"]:
        client.delete(f"/api/expenses/{e['id']}", params={"permanent": "true"}, headers=user_a)
    assert client.get("/api/expenses", headers=user_a).json()["total"] == 0
    res = client.post("/api/data/import", params={"dry_run": "false"}, json=data, headers=user_a).json()
    assert res["tables"]["expenses"]["imported"] == 1 and client.get("/api/expenses", headers=user_a).json()["total"] == 1


def test_import_validation_rejects_bad_files(client, user_a):
    imp = lambda payload: client.post("/api/data/import", params={"dry_run": "false"}, json=payload, headers=user_a)  # noqa: E731
    assert imp({"hello": "world"}).status_code == 400
    assert imp({"format": "veylotrace-export", "version": 99, "tables": {}}).status_code == 400
    assert imp({"format": "veylotrace-export", "version": 1, "tables": {"users": [{"id": 1}]}}).status_code == 400  # cannot touch other tables
    assert imp({"format": "veylotrace-export", "version": 1, "tables": {"expenses": "nope"}}).status_code == 400
    r = imp({"format": "veylotrace-export", "version": 1, "tables": {"expenses": [
        {"id": 1, "occurred_at": "not-a-date", "amount": "5"},
        {"id": 2, "occurred_at": NOW.isoformat(), "amount": "abc"},
        {"id": 3, "occurred_at": NOW.isoformat(), "amount": "9.99", "user_id": 12345, "category_id": 777},
        "junk",
    ]}})
    body = r.json()
    assert r.status_code == 200 and body["totals"] == {"imported": 1, "duplicates": 0, "invalid": 3} and body["errors"]
    exp = client.get("/api/expenses", headers=user_a).json()["items"]
    assert len(exp) == 1 and exp[0]["category_id"] is None  # dangling reference dropped; user_id in file ignored
    me = client.get("/api/auth/me", headers=user_a).json()["id"]
    from app.db.session import SessionLocal
    from app.models import Expense

    with SessionLocal() as s:
        assert s.query(Expense).one().user_id == me


def test_csv_export_per_module_is_formula_safe(client, user_a, user_b):
    client.post("/api/expenses", json={"occurred_at": NOW.isoformat(), "amount": "5", "description": "=cmd|' /C calc'!A0"}, headers=user_a)
    client.post("/api/expenses", json={"occurred_at": NOW.isoformat(), "amount": "7", "description": "B's secret"}, headers=user_b)
    r = client.get("/api/data/export/csv/expenses", headers=user_a)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "'=cmd" in r.text and "secret" not in r.text and r.text.splitlines()[0].startswith("id,")
    assert client.get("/api/data/export/csv/users", headers=user_a).status_code == 400
    assert "expenses" in client.get("/api/data/export/tables", headers=user_a).json()


# ---------------- database backups ----------------
@pytest.fixture()
def file_client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'app.db'}")
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    get_settings.cache_clear()
    engine = db_session.init_engine()
    Base.metadata.create_all(engine)
    with db_session.SessionLocal() as db:
        seed_roles(db)
    limiter.reset()
    with TestClient(create_app(), base_url="http://localhost") as c:
        yield c
    engine.dispose()
    monkeypatch.undo()
    get_settings.cache_clear()
    db_session.init_engine("sqlite://")


def admin_of(client):
    with db_session.SessionLocal() as db:
        return make_admin(client, db)[0]


def test_backup_verify_restore_cycle(file_client):
    client = file_client
    admin = admin_of(client)
    client.post("/api/expenses", json={"occurred_at": NOW.isoformat(), "amount": "11"}, headers=admin)
    meta = client.post("/api/admin/backups", headers=admin).json()
    assert meta["name"].endswith(".db") and meta["encrypted"] is False and len(meta["sha256"]) == 64
    assert client.get("/api/admin/backups", headers=admin).json()["items"][0]["name"] == meta["name"]
    ver = client.post(f"/api/admin/backups/{meta['name']}/verify", headers=admin).json()
    assert ver["ok"] and ver["integrity_ok"] and ver["checksum_ok"]

    exp_id = client.get("/api/expenses", headers=admin).json()["items"][0]["id"]
    client.delete(f"/api/expenses/{exp_id}", params={"permanent": "true"}, headers=admin)
    client.post("/api/expenses", json={"occurred_at": NOW.isoformat(), "amount": "999"}, headers=admin)

    assert client.post(f"/api/admin/backups/{meta['name']}/restore", json={"confirm": "no"}, headers=admin).status_code == 400
    res = client.post(f"/api/admin/backups/{meta['name']}/restore", json={"confirm": "RESTORE"}, headers=admin)
    assert res.status_code == 200 and res.json()["safety_backup"]
    items = client.get("/api/expenses", headers=admin).json()["items"]  # sessions live in the DB, so the admin's token is still valid
    assert [i["amount"] for i in items] == [11.0]


def test_backup_integrity_detects_tampering(file_client, tmp_path):
    client = file_client
    admin = admin_of(client)
    meta = client.post("/api/admin/backups", headers=admin).json()
    path = tmp_path / "backups" / meta["name"]
    path.write_bytes(path.read_bytes() + b"tamper")
    ver = client.post(f"/api/admin/backups/{meta['name']}/verify", headers=admin).json()
    assert ver["checksum_ok"] is False and ver["ok"] is False
    assert client.post(f"/api/admin/backups/{meta['name']}/restore", json={"confirm": "RESTORE"}, headers=admin).status_code == 400


def test_encrypted_backups(file_client, tmp_path, monkeypatch):
    client = file_client
    admin = admin_of(client)
    monkeypatch.setenv("BACKUP_PASSPHRASE", "correct horse battery staple")
    get_settings.cache_clear()
    client.post("/api/expenses", json={"occurred_at": NOW.isoformat(), "amount": "31337", "description": "PLAINTEXT-MARKER"}, headers=admin)
    meta = client.post("/api/admin/backups", headers=admin).json()
    assert meta["encrypted"] and meta["name"].endswith(".db.enc")
    raw = (tmp_path / "backups" / meta["name"]).read_bytes()
    assert raw.startswith(b"VTBK1") and b"PLAINTEXT-MARKER" not in raw and b"SQLite format" not in raw
    assert client.post(f"/api/admin/backups/{meta['name']}/verify", headers=admin).json()["ok"]
    monkeypatch.setenv("BACKUP_PASSPHRASE", "wrong passphrase")
    get_settings.cache_clear()
    assert client.post(f"/api/admin/backups/{meta['name']}/verify", headers=admin).status_code == 400


def test_backup_names_cannot_escape_directory(file_client):
    client = file_client
    admin = admin_of(client)
    for name in ("..%2Fapp.db", "../../etc/passwd", "app.db", "veylotrace-20200101T000000.db"):
        assert client.get(f"/api/admin/backups/{name}/download", headers=admin).status_code == 404, name
        assert client.delete(f"/api/admin/backups/{name}", headers=admin).status_code in (404, 405)
    meta = client.post("/api/admin/backups", headers=admin).json()
    d = client.get(f"/api/admin/backups/{meta['name']}/download", headers=admin)
    assert d.status_code == 200 and d.content.startswith(b"SQLite format")
    assert client.delete(f"/api/admin/backups/{meta['name']}", headers=admin).status_code == 200


def test_backup_retention_prunes_old_files(file_client, monkeypatch):
    client = file_client
    admin = admin_of(client)
    monkeypatch.setenv("BACKUP_RETENTION", "2")
    get_settings.cache_clear()
    import time as _t

    for _ in range(3):
        client.post("/api/admin/backups", headers=admin)
        _t.sleep(1.1)  # names carry a one-second timestamp
    assert len(client.get("/api/admin/backups", headers=admin).json()["items"]) == 2


