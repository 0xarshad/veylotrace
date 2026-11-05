<p align="center">
  <img src="frontend/public/veylo-logo.svg" alt="VeyloTrace logo" width="88">
</p>

<h1 align="center">VeyloTrace</h1>

<p align="center">A personal tracker for health, finances, nutrition, work, learning, and everyday life.</p>

VeyloTrace brings daily logs, goals, reports, and challenges into one app. It runs locally and stores its data in a local
SQLite database. The AI assistant is optional.

## Get started

You’ll need Python 3.10 or newer and an internet connection for the first install. From the project directory, run:

```bash
./install.sh
./run.sh
```

The installer creates `backend/.env` from the example configuration, generates the required secrets, and installs the
backend and frontend dependencies. It uses system Node.js 18+ when available or downloads a project-local Node.js LTS
copy, and it checks for Cloudflare Tunnel (`cloudflared`) and downloads that locally when needed. You can enter a Groq
API key during installation or leave it blank.

When startup finishes, `run.sh` prints the local app address, a temporary public URL, and the API docs address. The
public URL is provided by a Cloudflare Quick Tunnel, changes each time, and works only while `run.sh` is running. Anyone
with the link can reach the app, so use test data when sharing it. To run locally without a public URL, use:

```bash
./run.sh --local
```

Press Ctrl+C to stop the app and tunnel.

## First sign-in

Open <http://localhost:5173> and create an account. By default, the app writes email messages such as verification and
password reset links to `backend/data/outbox/` instead of sending them. To view them:

```bash
cd backend && .venv/bin/python -m app.cli outbox
```

You can also mark an account as verified from the command line:

```bash
cd backend && .venv/bin/python -m app.cli verify-email you@example.com
```

To create an administrator account:

```bash
cd backend && .venv/bin/python -m app.cli create-admin you@example.com "Your Name"
```

## AI assistant

AI features are optional. After creating an account, go to **AI Assistant → Providers** to add a provider. If you entered
a Groq key during installation, choose Groq and leave the key field empty to use it. The app still asks you to enable
cloud-data consent before sending data to an external provider.

Configuration options are listed in [`backend/.env.example`](backend/.env.example). Keep `backend/.env` private; it
contains the app’s signing and encryption keys.

## Data and backups

Users can import and export their data under **Settings → Data & Backup**, including JSON backups and per-section CSV
exports. Administrators can manage database backups under **Settings → Admin → Database backups**. See
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) for backup and restore details.

## Development

The frontend uses React, TypeScript, Vite, Tailwind CSS, TanStack Query, and Recharts. The backend uses FastAPI,
SQLAlchemy, and Alembic migrations. SQLite is the default database. Run these commands from the project root:

```bash
export PATH="$PWD/backend/.tools/node/bin:$PATH"
(cd frontend && npm test && npm run build)
(cd backend && .venv/bin/pytest -q)
```

The interactive API docs are available at <http://localhost:8100/api/docs> while the app is running.

For a single-machine deployment, build the frontend with `cd frontend && npm run build`, then serve `frontend/dist` and
reverse-proxy `/api` to the backend over HTTPS. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/SECURITY.md`](docs/SECURITY.md) for implementation details.
