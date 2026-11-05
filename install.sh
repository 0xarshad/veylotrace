#!/usr/bin/env bash
# Repeatable local setup for VeyloTrace.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
ENV_FILE="$BACKEND/.env"
TOOLS="$BACKEND/.tools"
NODE_HOME="$TOOLS/node"
CLOUDFLARED="$TOOLS/cloudflared"

log() { printf '\033[1;36m[veylotrace install]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[veylotrace install] %s\033[0m\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || die "Python 3.10+ is required."
command -v sha256sum >/dev/null || die "sha256sum is required."
command -v curl >/dev/null || die "curl is required to download dependencies."
command -v tar >/dev/null || die "tar is required to install Node.js."
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || die "Python 3.10 or newer is required."

# Use system Node.js when it is recent enough; otherwise install an official
# LTS build into the project so no system-wide package install or sudo is needed.
if [ -x "$NODE_HOME/bin/node" ] && [ -x "$NODE_HOME/bin/npm" ]; then
  export PATH="$NODE_HOME/bin:$PATH"
fi
if command -v node >/dev/null && command -v npm >/dev/null && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  log "Node.js $(node --version) and npm detected."
else
  case "$(uname -s):$(uname -m)" in
    Linux:x86_64) node_platform="linux-x64" ;;
    Linux:aarch64|Linux:arm64) node_platform="linux-arm64" ;;
    Linux:armv7l) node_platform="linux-armv7l" ;;
    Darwin:x86_64) node_platform="darwin-x64" ;;
    Darwin:arm64) node_platform="darwin-arm64" ;;
    *) die "No automatic Node.js download for $(uname -s)/$(uname -m). Install Node.js 18 or newer and npm manually." ;;
  esac
  mkdir -p "$TOOLS"
  node_manifest="$TOOLS/node-SHASUMS256.txt"
  log "Node.js 18+ not found; downloading the current Node.js 24 LTS release…"
  curl -fsSL --retry 3 "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt" -o "$node_manifest"
  node_archive="$(awk -v platform="$node_platform" '$2 ~ ("-" platform "\\.tar\\.xz$") {print $2; exit}' "$node_manifest")"
  [ -n "$node_archive" ] || die "Could not find an official Node.js archive for $node_platform."
  node_hash="$(awk -v file="$node_archive" '$2 == file {print $1; exit}' "$node_manifest")"
  curl -fsSL --retry 3 "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$TOOLS/$node_archive"
  printf '%s  %s\n' "$node_hash" "$TOOLS/$node_archive" | sha256sum -c - >/dev/null || die "Node.js download checksum verification failed."
  tar -xJf "$TOOLS/$node_archive" -C "$TOOLS"
  node_directory="${node_archive%.tar.xz}"
  ln -sfn "$TOOLS/$node_directory" "$NODE_HOME"
  rm -f "$TOOLS/$node_archive" "$node_manifest"
  export PATH="$NODE_HOME/bin:$PATH"
  log "Node.js $(node --version) and npm installed in $NODE_HOME."
fi

# A local cloudflared copy makes the default public URL work without a
# separate system package installation.
if command -v cloudflared >/dev/null; then
  log "Cloudflare Tunnel detected: $(command -v cloudflared)"
elif [ -x "$CLOUDFLARED" ]; then
  log "Cloudflare Tunnel detected in the project: $CLOUDFLARED"
else
  case "$(uname -s):$(uname -m)" in
    Linux:x86_64) cloudflared_platform="linux-amd64" ;;
    Linux:aarch64|Linux:arm64) cloudflared_platform="linux-arm64" ;;
    Linux:armv7l) cloudflared_platform="linux-arm" ;;
    Darwin:x86_64) cloudflared_platform="darwin-amd64" ;;
    Darwin:arm64) cloudflared_platform="darwin-arm64" ;;
    *) die "No automatic cloudflared download for $(uname -s)/$(uname -m). Install cloudflared manually to use the public URL." ;;
  esac
  mkdir -p "$TOOLS"
  log "Downloading Cloudflare Tunnel for the public URL…"
  curl -fsSL --retry 3 \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-$cloudflared_platform" \
    -o "$CLOUDFLARED.tmp"
  chmod 700 "$CLOUDFLARED.tmp"
  mv "$CLOUDFLARED.tmp" "$CLOUDFLARED"
  "$CLOUDFLARED" --version >/dev/null || die "Downloaded cloudflared could not run on this system."
  log "Cloudflare Tunnel installed in the project: $CLOUDFLARED"
fi

# Ensure the default database, email outbox, and backup paths are writable.
mkdir -p "$BACKEND/data/outbox" "$BACKEND/data/backups"

if [ ! -x "$VENV/bin/python" ]; then
  log "Creating backend virtual environment…"
  python3 -m venv "$VENV"
fi

requirements_hash="$(sha256sum "$BACKEND/requirements.txt" | cut -d' ' -f1)"
requirements_stamp="$VENV/.requirements.sha"
if [ ! -f "$requirements_stamp" ] || [ "$(cat "$requirements_stamp")" != "$requirements_hash" ]; then
  log "Installing backend dependencies…"
  "$VENV/bin/python" -m pip install --quiet --upgrade pip
  "$VENV/bin/python" -m pip install --quiet -r "$BACKEND/requirements.txt"
  printf '%s\n' "$requirements_hash" > "$requirements_stamp"
else
  log "Backend dependencies are current."
fi

if [ ! -f "$ENV_FILE" ]; then
  log "Creating backend/.env from .env.example and generating fresh secrets…"
  (cd "$BACKEND" && "$VENV/bin/python" scripts/init_env.py)
else
  log "Keeping existing backend/.env and its secrets."
fi

groq_key=""
if [ -t 0 ]; then
  printf 'Groq API key (optional; press Enter to skip/keep the current value): '
  IFS= read -r -s groq_key || groq_key=""
  printf '\n'
else
  log "No interactive terminal; skipping the optional Groq key prompt."
fi

# Read the key over stdin rather than passing it in process arguments. Never print it.
printf '%s' "$groq_key" | python3 -c '
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.stdin.read().strip()
lines = path.read_text().splitlines()
found = False
for index, line in enumerate(lines):
    if line.startswith("GROQ_API_KEY="):
        found = True
        if key:
            lines[index] = "GROQ_API_KEY=" + key
        break
if not found:
    lines.append("GROQ_API_KEY=" + key)
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
' "$ENV_FILE"
unset groq_key

lock_hash="$(sha256sum "$FRONTEND/package-lock.json" | cut -d' ' -f1)"
lock_stamp="$FRONTEND/node_modules/.lock.sha"
if [ ! -x "$FRONTEND/node_modules/.bin/vite" ] || [ "$(cat "$lock_stamp" 2>/dev/null || true)" != "$lock_hash" ]; then
  log "Installing frontend dependencies…"
  (cd "$FRONTEND" && npm ci --no-audit --no-fund --loglevel=error)
  printf '%s\n' "$lock_hash" > "$lock_stamp"
else
  log "Frontend dependencies are current."
fi

log "Install complete. Start the app with ./run.sh"
