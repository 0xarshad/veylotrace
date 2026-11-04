"""Whole-database backups (SQLite): consistent snapshots, optional encryption at rest, integrity verification, restore."""

import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import tempfile
import threading
from base64 import urlsafe_b64encode
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.core.errors import AppError, bad_request, not_found
from app.core.security import utcnow

log = logging.getLogger("veylotrace.backup")
MAGIC = b"VTBK1"
NAME_RE = re.compile(r"^veylotrace-\d{8}T\d{6}(-[a-z]+)?\.db(\.enc)?$")


def _db_path() -> Path:
    url = make_url(get_settings().database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise AppError(501, "unsupported", "Built-in backups support file-based SQLite only. For PostgreSQL use pg_dump (see docs/OPERATIONS.md).")
    return Path(url.database)


def backup_dir() -> Path:
    d = Path(get_settings().backup_dir)
    d.mkdir(parents=True, exist_ok=True)
    os.chmod(d, 0o700)
    return d


def _key(passphrase: str, salt: bytes) -> bytes:
    return urlsafe_b64encode(Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(passphrase.encode()))


def _encrypt(data: bytes, passphrase: str) -> bytes:
    salt = os.urandom(16)
    return MAGIC + salt + Fernet(_key(passphrase, salt)).encrypt(data)


def _decrypt(blob: bytes, passphrase: str) -> bytes:
    if not blob.startswith(MAGIC):
        raise bad_request("Not a VeyloTrace encrypted backup.", "invalid_backup")
    salt, token = blob[len(MAGIC): len(MAGIC) + 16], blob[len(MAGIC) + 16:]
    try:
        return Fernet(_key(passphrase, salt)).decrypt(token)
    except InvalidToken:
        raise bad_request("Backup could not be decrypted (wrong BACKUP_PASSPHRASE or corrupted file).", "decrypt_failed")


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _integrity_ok(db_file: Path) -> bool:
    try:
        con = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
        try:
            return con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        finally:
            con.close()
    except sqlite3.DatabaseError:
        return False


def _safe_path(name: str) -> Path:
    if not NAME_RE.match(name):
        raise not_found("Backup not found.")
    p = backup_dir() / name
    if not p.is_file():
        raise not_found("Backup not found.")
    return p


def create_backup(label: str = "manual") -> dict:
    s = get_settings()
    src = _db_path()
    stamp = utcnow().strftime("%Y%m%dT%H%M%S")
    suffix = "" if label == "manual" else f"-{re.sub('[^a-z]', '', label.lower())[:12] or 'auto'}"
    d = backup_dir()
    with tempfile.TemporaryDirectory(dir=d) as tmp:
        snap = Path(tmp) / "snapshot.db"
        con, dst = sqlite3.connect(src), sqlite3.connect(snap)
        try:
            con.backup(dst)  # online, transactionally-consistent copy
        finally:
            dst.close()
            con.close()
        if not _integrity_ok(snap):
            raise AppError(500, "backup_failed", "Database failed its integrity check; backup aborted.")
        encrypted = bool(s.backup_passphrase)
        name = f"veylotrace-{stamp}{suffix}.db" + (".enc" if encrypted else "")
        out = d / name
        if encrypted:
            out.write_bytes(_encrypt(snap.read_bytes(), s.backup_passphrase))
        else:
            shutil.copy2(snap, out)
        os.chmod(out, 0o600)
    meta = {"name": name, "created_at": utcnow().isoformat(), "size": out.stat().st_size, "sha256": _sha(out), "encrypted": encrypted, "label": label}
    (d / f"{name}.json").write_text(json.dumps(meta))
    prune(s.backup_retention)
    return meta


def list_backups() -> list[dict]:
    out = []
    for p in sorted(backup_dir().glob("veylotrace-*.json"), reverse=True):
        try:
            out.append(json.loads(p.read_text()))
        except (json.JSONDecodeError, OSError):
            continue
    return out


def prune(keep: int) -> None:
    items = list_backups()
    for meta in items[max(keep, 1):]:
        for suffix in ("", ".json"):
            (backup_dir() / f"{meta['name']}{suffix}").unlink(missing_ok=True)


def verify_backup(name: str) -> dict:
    path = _safe_path(name)
    meta_path = backup_dir() / f"{name}.json"
    meta = json.loads(meta_path.read_text()) if meta_path.is_file() else {}
    checksum_ok = (_sha(path) == meta.get("sha256")) if meta else None
    with tempfile.TemporaryDirectory(dir=backup_dir()) as tmp:
        plain = Path(tmp) / "check.db"
        if name.endswith(".enc"):
            pw = get_settings().backup_passphrase
            if not pw:
                raise bad_request("BACKUP_PASSPHRASE is not configured, so this encrypted backup cannot be verified.", "no_passphrase")
            plain.write_bytes(_decrypt(path.read_bytes(), pw))
        else:
            shutil.copy2(path, plain)
        integrity = _integrity_ok(plain)
    return {"name": name, "checksum_ok": checksum_ok, "integrity_ok": integrity, "ok": bool(integrity and checksum_ok is not False)}


def restore_backup(name: str) -> dict:
    from app.db.session import get_engine, init_engine
    from app.main import run_migrations

    check = verify_backup(name)
    if not check["ok"]:
        raise bad_request("Backup failed verification; restore aborted.", "verification_failed")
    path = _safe_path(name)
    target = _db_path()
    safety = create_backup("prerestore")
    with tempfile.TemporaryDirectory(dir=backup_dir()) as tmp:
        plain = Path(tmp) / "restore.db"
        if name.endswith(".enc"):
            plain.write_bytes(_decrypt(path.read_bytes(), get_settings().backup_passphrase))
        else:
            shutil.copy2(path, plain)
        get_engine().dispose()
        for ext in ("-wal", "-shm"):
            Path(str(target) + ext).unlink(missing_ok=True)
        shutil.copy2(plain, target)
    init_engine()
    if get_settings().app_env != "test":
        run_migrations()  # a backup taken on an older schema is upgraded in place
    return {"restored": name, "safety_backup": safety["name"]}


def delete_backup(name: str) -> None:
    path = _safe_path(name)
    path.unlink()
    (backup_dir() / f"{name}.json").unlink(missing_ok=True)


def backup_path(name: str) -> Path:
    return _safe_path(name)


# ---------------- scheduler ----------------
_stop = threading.Event()
_thread: threading.Thread | None = None


def _loop(hours: float) -> None:
    while not _stop.wait(hours * 3600):
        try:
            create_backup("auto")
        except Exception:  # noqa: BLE001
            log.exception("Scheduled backup failed")


def start_scheduler() -> None:
    global _thread
    hours = get_settings().auto_backup_hours
    if hours > 0 and _thread is None:
        _stop.clear()
        _thread = threading.Thread(target=_loop, args=(hours,), name="backup-scheduler", daemon=True)
        _thread.start()


def stop_scheduler() -> None:
    global _thread
    _stop.set()
    _thread = None
