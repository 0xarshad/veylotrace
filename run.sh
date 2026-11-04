#!/usr/bin/env bash
# Starts VeyloTrace (backend + frontend) for local use.
#   ./run.sh             set up anything missing, then run both servers (Ctrl+C stops both)
#   ./run.sh setup       only install dependencies / create .env, then exit
#   ./run.sh test        run the backend and frontend test suites
# Overrides: BACKEND_PORT (default 8100), FRONTEND_PORT (default 5173)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
BACKEND_PORT="${BACKEND_PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
VENV="$BACKEND/.venv"

log() { printf '\033[1;36m[veylotrace]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[veylotrace] %s\033[0m\n' "$*" >&2; exit 1; }

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

setup() {
  command -v python3 >/dev/null || die "python3 is required (3.10+)."
  command -v node >/dev/null || die "Node.js is required (18+)."
  command -v npm >/dev/null || die "npm is required."

  if [ ! -x "$VENV/bin/python" ]; then
    log "Creating Python virtual environment…"
    python3 -m venv "$VENV"
  fi
  # Reinstall only when requirements changed.
  local stamp="$VENV/.requirements.sha"
  local sum; sum="$(cat "$BACKEND/requirements.txt" "$BACKEND/requirements-dev.txt" | sha256sum | cut -d' ' -f1)"
  if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$sum" ]; then
    log "Installing backend dependencies…"
    "$VENV/bin/pip" install -q --upgrade pip
    "$VENV/bin/pip" install -q -r "$BACKEND/requirements-dev.txt"
    echo "$sum" > "$stamp"
  fi

  if [ ! -f "$BACKEND/.env" ]; then
    log "Creating backend/.env with fresh random secrets…"
    (cd "$BACKEND" && "$VENV/bin/python" scripts/init_env.py)
  fi

  local fsum; fsum="$(sha256sum "$FRONTEND/package-lock.json" | cut -d' ' -f1)"
  if [ ! -d "$FRONTEND/node_modules" ] || [ "$(cat "$FRONTEND/node_modules/.lock.sha" 2>/dev/null || true)" != "$fsum" ]; then
    log "Installing frontend dependencies…"
    (cd "$FRONTEND" && npm install --no-audit --no-fund --loglevel=error)
    echo "$fsum" > "$FRONTEND/node_modules/.lock.sha"
  fi
}

run_tests() {
  setup
  log "Backend tests…"
  (cd "$BACKEND" && "$VENV/bin/python" -m pytest -q)
  log "Frontend typecheck, tests and build…"
  (cd "$FRONTEND" && npx tsc -b --noEmit && npx vitest run && npx vite build >/dev/null && rm -rf dist)
  log "All checks passed."
}

run_all() {
  setup
  port_in_use "$BACKEND_PORT" && die "Port $BACKEND_PORT is already in use. Stop the other process or set BACKEND_PORT."
  port_in_use "$FRONTEND_PORT" && die "Port $FRONTEND_PORT is already in use. Stop the other process or set FRONTEND_PORT."

  local pids=()
  cleanup() {
    trap - INT TERM EXIT
    log "Stopping…"
    for pid in "${pids[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done
    wait 2>/dev/null || true
    exit 0
  }
  trap cleanup INT TERM EXIT

  log "Starting backend on http://127.0.0.1:$BACKEND_PORT (migrations run automatically)…"
  (cd "$BACKEND" && exec "$VENV/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT") &
  pids+=("$!")

  for _ in $(seq 1 60); do
    curl -fs "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1 && break
    kill -0 "${pids[0]}" 2>/dev/null || die "Backend failed to start (see the output above)."
    sleep 0.5
  done

  log "Starting frontend on http://localhost:$FRONTEND_PORT …"
  (cd "$FRONTEND" && VITE_API_PROXY="http://127.0.0.1:$BACKEND_PORT" exec ./node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort) &
  pids+=("$!")

  cat <<EOF

  VeyloTrace is running:
    App:       http://localhost:$FRONTEND_PORT
    API docs:  http://127.0.0.1:$BACKEND_PORT/api/docs
    Emails:    written to backend/data/outbox (python -m app.cli outbox)
  Handy (in another terminal, from backend/ with the venv active):
    python -m app.cli verify-email you@example.com
    python -m app.cli create-admin you@example.com "Your Name"
  Press Ctrl+C to stop both servers.

EOF
  wait -n "${pids[@]}" || true
  die "A server exited unexpectedly."
}

case "${1:-run}" in
  run) run_all ;;
  setup) setup; log "Setup complete." ;;
  test) run_tests ;;
  *) die "Usage: ./run.sh [run|setup|test]" ;;
esac
