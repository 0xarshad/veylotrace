# Operations

## Migrations
Schema changes are Alembic migrations in `backend/alembic/versions` (applied automatically at start-up, or manually):

```bash
cd backend
alembic upgrade head                                  # apply
alembic revision --autogenerate -m "describe change"  # create (review the file! replace app.db.base.UTCDateTime() with sa.DateTime())
alembic downgrade -1
```
A test (`tests/test_migrations.py`) fails if models and migrations drift. Never edit production tables by hand.

## Backups
**Per user (no admin needed):** Settings → Data & Backup → *Export all my data (JSON)* and per-module CSV. Re-import
with the preview (dry-run) that reports imported / duplicate / invalid rows. Credentials (AI keys) are never exported.

**Whole database (administrators):**
* UI: Settings → Admin → Database backups — create, verify, download, restore, delete.
* CLI: `python -m app.cli backup`.
* Scheduled: `AUTO_BACKUP_HOURS=24`, retention `BACKUP_RETENTION=14` (oldest pruned).
* Encryption: set `BACKUP_PASSPHRASE`; files become `*.db.enc` (scrypt + Fernet). Keep the passphrase safe.
* Integrity: each backup has a manifest with SHA-256; *Verify* re-checks the checksum and runs `PRAGMA integrity_check`.
* Restore: verifies the file, takes a `-prerestore` safety backup, swaps the database file, re-applies migrations.
  Run it when nobody else is using the app. Copy backups off the machine regularly (3-2-1 rule).

Manual restore without the app: stop the server, copy a plain backup over `backend/data/veylotrace.db`
(for `.enc` files decrypt through *Verify/Restore* instead), delete `*.db-wal`/`*.db-shm`, start the server.

## Moving to PostgreSQL
1. `pip install "psycopg[binary]"`, create the database.
2. Set `DATABASE_URL=postgresql+psycopg://user:pass@host/veylotrace` and run `alembic upgrade head`.
3. Move data with the app's own export/import per user (Settings → Data & Backup), or a SQLite→PG migration tool.
4. Use `pg_dump` for backups (built-in backups are SQLite-only and report `unsupported` otherwise).

## Useful commands
```bash
python -m app.cli create-admin you@example.com "Your Name"
python -m app.cli verify-email user@example.com
python -m app.cli list-users
python -m app.cli outbox          # emails written by EMAIL_BACKEND=file
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| App exits: "JWT_SECRET must be set" | run `python scripts/init_env.py` |
| Can't sign in: "verify your email" | `python -m app.cli outbox` or `verify-email` |
| "credential can't be decrypted" for an AI provider | `ENCRYPTION_KEY` changed — re-enter the provider key |
| Logged out after a few minutes behind HTTPS proxy | `COOKIE_SECURE=true`, serve app and `/api` from one origin |
| 429 responses | rate limits (login: 5 attempts / 5 min per IP+email) — wait for `Retry-After` |
