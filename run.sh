#!/usr/bin/env bash
# Run VeyloTrace after ./install.sh has completed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
ENV_FILE="$BACKEND/.env"
CLOUDFLARED="$BACKEND/.tools/cloudflared"
BACKEND_PORT="${BACKEND_PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PUBLIC_TUNNEL=1

log() { printf '\033[1;36m[veylotrace]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[veylotrace] %s\033[0m\n' "$*" >&2; exit 1; }

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  printf 'Usage: ./run.sh [--public|--local]\n\nStarts the backend and frontend, plus a free temporary public URL by default. Press Ctrl+C to stop them.\nRun ./install.sh once before the first launch.\n\nOptions:\n  --public  Start a Cloudflare Quick Tunnel (default)\n  --local   Run locally without a public tunnel\n\nOverrides: BACKEND_PORT (default 8100), FRONTEND_PORT (default 5173)\n'
  exit 0
fi
if [ "$#" -gt 0 ]; then
  [ "$#" -eq 1 ] || die "Usage: ./run.sh [--public|--local] [--help]"
  case "$1" in
    --public) PUBLIC_TUNNEL=1 ;;
    --local) PUBLIC_TUNNEL=0 ;;
    *) die "Usage: ./run.sh [--public|--local] [--help]" ;;
  esac
fi
[ -f "$ENV_FILE" ] || die "backend/.env is missing. Run ./install.sh first."
[ -x "$VENV/bin/python" ] || die "Backend dependencies are missing. Run ./install.sh first."
[ -x "$FRONTEND/node_modules/.bin/vite" ] || die "Frontend dependencies are missing. Run ./install.sh first."
command -v curl >/dev/null || die "curl is required to check backend startup."
[ "$BACKEND_PORT" != "$FRONTEND_PORT" ] || die "Backend and frontend ports must be different."
if [ "$PUBLIC_TUNNEL" -eq 1 ]; then
  if command -v cloudflared >/dev/null; then
    CLOUDFLARED="$(command -v cloudflared)"
  elif [ ! -x "$CLOUDFLARED" ]; then
    die "cloudflared is missing. Run ./install.sh to install it for this project."
  fi
fi

port_in_use "$BACKEND_PORT" && die "Port $BACKEND_PORT is already in use. Stop the other process or set BACKEND_PORT."
port_in_use "$FRONTEND_PORT" && die "Port $FRONTEND_PORT is already in use. Stop the other process or set FRONTEND_PORT."

pids=()
TUNNEL_LOG=""
PUBLIC_URL=""
cleanup() {
  local status=$?
  trap - INT TERM EXIT
  log "Stopping…"
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  [ -z "$TUNNEL_LOG" ] || rm -f "$TUNNEL_LOG"
  exit "$status"
}
trap cleanup INT TERM EXIT

if [ "$PUBLIC_TUNNEL" -eq 1 ]; then
  log "Creating public URL and starting the app…"
fi

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

if [ "$PUBLIC_TUNNEL" -eq 1 ]; then
  frontend_ready=0
  for _ in $(seq 1 60); do
    if curl -fs "http://127.0.0.1:$FRONTEND_PORT" >/dev/null 2>&1; then
      frontend_ready=1
      break
    fi
    kill -0 "${pids[1]}" 2>/dev/null || die "Frontend failed to start."
    sleep 0.5
  done
  [ "$frontend_ready" -eq 1 ] || die "Frontend did not become ready within 30 seconds."

  TUNNEL_LOG="$(mktemp "${TMPDIR:-/tmp}/veylotrace-cloudflared.XXXXXX")"
  "$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$FRONTEND_PORT" >"$TUNNEL_LOG" 2>&1 &
  pids+=("$!")
  TUNNEL_PID="${pids[2]}"
  PUBLIC_URL=""
  for _ in $(seq 1 60); do
    PUBLIC_URL="$(grep -Eo 'https://[[:alnum:]-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
    [ -z "$PUBLIC_URL" ] || break
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      tail -n 8 "$TUNNEL_LOG" >&2
      die "Cloudflare could not create a public URL."
    fi
    sleep 1
  done
  [ -n "$PUBLIC_URL" ] || die "Cloudflare did not provide a public URL within 60 seconds. Check network access and try again."
fi

API_DOCS_URL="http://127.0.0.1:$BACKEND_PORT/api/docs"
if [ -n "$PUBLIC_URL" ]; then
  API_DOCS_URL="$PUBLIC_URL/api/docs"
fi

cat <<EOF

  VeyloTrace ready
  ➜ Local:      http://localhost:$FRONTEND_PORT
  ${PUBLIC_URL:+➜ Public:     $PUBLIC_URL}
  ➜ API docs:   $API_DOCS_URL
  ➜ Local API:  http://127.0.0.1:$BACKEND_PORT/api/docs
  ➜ Email box:  backend/data/outbox

  Handy commands (run from backend/ with the venv active):
    python -m app.cli outbox
    python -m app.cli verify-email you@example.com
    python -m app.cli create-admin you@example.com "Your Name"
  Press Ctrl+C to stop the servers and tunnel.

EOF

wait -n "${pids[@]}" || true
die "A server exited unexpectedly."
