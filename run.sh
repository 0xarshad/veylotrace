#!/usr/bin/env bash
# Run VeyloTrace after ./install.sh has completed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
ENV_FILE="$BACKEND/.env"
BACKEND_PORT="${BACKEND_PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

log() { printf '\033[1;36m[veylotrace]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[veylotrace] %s\033[0m\n' "$*" >&2; exit 1; }

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  printf 'Usage: ./run.sh\n\nStarts the backend and frontend. Press Ctrl+C to stop both.\nRun ./install.sh once before the first launch.\n\nOverrides: BACKEND_PORT (default 8100), FRONTEND_PORT (default 5173)\n'
  exit 0
fi
[ "$#" -eq 0 ] || die "Usage: ./run.sh [--help]"
[ -f "$ENV_FILE" ] || die "backend/.env is missing. Run ./install.sh first."
[ -x "$VENV/bin/python" ] || die "Backend dependencies are missing. Run ./install.sh first."
[ -x "$FRONTEND/node_modules/.bin/vite" ] || die "Frontend dependencies are missing. Run ./install.sh first."
command -v curl >/dev/null || die "curl is required to check backend startup."
[ "$BACKEND_PORT" != "$FRONTEND_PORT" ] || die "Backend and frontend ports must be different."

port_in_use "$BACKEND_PORT" && die "Port $BACKEND_PORT is already in use. Stop the other process or set BACKEND_PORT."
port_in_use "$FRONTEND_PORT" && die "Port $FRONTEND_PORT is already in use. Stop the other process or set FRONTEND_PORT."

pids=()
cleanup() {
  local status=$?
  trap - INT TERM EXIT
  log "Stopping…"
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit "$status"
}
trap cleanup INT TERM EXIT

log "Starting backend on http://127.0.0.1:$BACKEND_PORT (migrations run automatically)…"
(cd "$BACKEND" && exec "$VENV/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT") &
pids+=("$!")

backend_ready=0
for _ in $(seq 1 60); do
  if curl -fs "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
    backend_ready=1
    break
  fi
  kill -0 "${pids[0]}" 2>/dev/null || die "Backend failed to start (see the output above)."
  sleep 0.5
done
[ "$backend_ready" -eq 1 ] || die "Backend did not become ready within 30 seconds."

log "Starting frontend on http://localhost:$FRONTEND_PORT…"
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
