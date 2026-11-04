"""Generate a local .env with fresh random secrets (never overwrites an existing file).

    python scripts/init_env.py
"""

import secrets
import sys
from pathlib import Path

from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / ".env"
if target.exists():
    sys.exit(f"{target} already exists; refusing to overwrite. Delete it first if you really want new secrets "
             "(note: a new ENCRYPTION_KEY makes stored AI provider keys unreadable).")

example = (ROOT / ".env.example").read_text()
replacements = {
    "JWT_SECRET=": f"JWT_SECRET={secrets.token_urlsafe(64)}",
    "ENCRYPTION_KEY=": f"ENCRYPTION_KEY={Fernet.generate_key().decode()}",
}
lines = []
for line in example.splitlines():
    for prefix, new in replacements.items():
        if line.startswith(prefix):
            line = new
    lines.append(line)
target.write_text("\n".join(lines) + "\n")
target.chmod(0o600)
print(f"Wrote {target} with new random JWT_SECRET and ENCRYPTION_KEY. Keep this file private and back it up.")
