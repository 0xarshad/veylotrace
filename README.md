# VeyloTrace — personal life management (LIFE OS)

A local-first, secure, full-stack app for tracking finances, health, nutrition, lifestyle, productivity, learning and
social life, with dashboards, reports, challenges, backup/export — and **optional, independent** AI analysis.
The app is fully useful with no AI provider configured.

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts |
| Backend | Python 3.10+, FastAPI, SQLAlchemy 2, Alembic, Argon2id, PyJWT |
| Database | SQLite (local) — schema/queries are PostgreSQL-portable |
| AI (optional) | Groq, OpenAI, Anthropic (official SDKs), Ollama (local REST), Hugging Face (Inference Providers / dedicated endpoints) |

## Quick start (local)

Prerequisites: Python ≥ 3.10, Node ≥ 18.

```bash
# 1. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/init_env.py            # writes .env with fresh random JWT_SECRET + ENCRYPTION_KEY (never overwrites)
uvicorn app.main:app --port 8100      # applies database migrations automatically on start-up

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                           # http://localhost:5173  (proxies /api to http://127.0.0.1:8100)
```

Open <http://localhost:5173> and **Create account** — you can sign in straight away (email verification is only required once you configure `EMAIL_BACKEND=smtp`, or force it with `REQUIRE_EMAIL_VERIFICATION=true`).
With the default `EMAIL_BACKEND=file`, emails (e.g. password reset links) are written to `backend/data/outbox/` instead of being sent:

```bash
cd backend && python -m app.cli outbox          # prints the verification link
# or skip the link:
python -m app.cli verify-email you@example.com
```

Create an administrator (public registration can never create one):

```bash
cd backend && python -m app.cli create-admin you@example.com "Your Name"
```

To point the dev proxy elsewhere: `VITE_API_PROXY=http://127.0.0.1:9000 npm run dev`.
Interactive API docs (development only): <http://localhost:8100/api/docs>.

## Configuration

All backend settings are environment variables (see [`backend/.env.example`](backend/.env.example)); nothing secret is in
source control. Important ones:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | ≥ 32 random chars; signs access tokens (the app refuses to start without it) |
| `ENCRYPTION_KEY` | Fernet key; encrypts AI provider credentials at rest. **Back it up** — losing it makes saved provider keys unreadable |
| `CORS_ORIGINS`, `FRONTEND_URL` | Allowed browser origins / link base for emails |
| `COOKIE_SECURE` | Must be `true` behind HTTPS (enforced in production) |
| `EMAIL_BACKEND` | `file` (dev) or `smtp` (+ `SMTP_*`) |
| `AUTO_BACKUP_HOURS`, `BACKUP_RETENTION`, `BACKUP_PASSPHRASE` | Scheduled / encrypted backups |

## Tests

```bash
cd backend && pytest -q                 # auth, RBAC, isolation, CRUD for every module, analytics, AI, backup/import
cd frontend && npm test && npm run build
```

## Local deployment (single machine)

```bash
cd frontend && npm run build                 # static files in frontend/dist
cd backend && APP_ENV=production uvicorn app.main:app --host 127.0.0.1 --port 8100
```

Serve `frontend/dist` and reverse-proxy `/api` to the backend from **one origin** over HTTPS (Caddy, nginx, …) so the
HttpOnly `SameSite=Strict` refresh cookie works. Example Caddy:

```
your.domain {
    handle /api/* { reverse_proxy 127.0.0.1:8100 }
    handle { root * /path/to/frontend/dist
             try_files {path} /index.html
             file_server }
}
```

Set in `.env`: `APP_ENV=production`, `COOKIE_SECURE=true`, `CORS_ORIGINS=https://your.domain`,
`FRONTEND_URL=https://your.domain`, `EMAIL_BACKEND=smtp` with SMTP credentials. Run a single worker (rate limiting and the
backup scheduler are in-process; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#scaling-notes)).

## Backup, restore and your data

* **Users:** Settings → Data & Backup — full JSON export, per-module CSV exports, validated **import with dry-run and
  duplicate detection**. Your records never depend on the AI service.
* **Administrators:** Settings → Admin → Database backups (consistent SQLite snapshots with SHA-256 + integrity
  verification, optional encryption with `BACKUP_PASSPHRASE`, restore with typed confirmation), or via CLI:
  `python -m app.cli backup`. Details and PostgreSQL notes: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Documentation

* [Architecture](docs/ARCHITECTURE.md) — modules, data model, request flow, AI design
* [Security](docs/SECURITY.md) — threat model, controls, how each requirement is met
* [Operations](docs/OPERATIONS.md) — migrations, backups, restore, PostgreSQL, troubleshooting
