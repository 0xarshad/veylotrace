# Security

## Authentication & sessions
| Requirement | Implementation |
|---|---|
| Argon2id passwords | `argon2-cffi` (t=3, 64 MiB, p=2), transparent rehash; dummy-hash verify for unknown users (timing) |
| Password policy | ≥10 chars, upper/lower/digit/symbol, not common, must not contain email name or name |
| Short-lived JWT | HS256 (allow-listed, configurable HS256/384/512), 15 min; claims `iss`, `aud`, `sub`, `sid`, `exp`, `iat`, `nbf`, `jti`, `typ=access` — all validated; `alg=none`/foreign algorithms rejected |
| Server-side sessions | Each token carries `sid`; every request verifies the session is live (not revoked/expired), the user is active and verified. Role/permissions are re-read from the DB — a forged `role` claim is ignored |
| Refresh tokens | Opaque 384-bit random, stored as SHA-256, **rotated on every use**, single-use claim is atomic; **reuse after the grace window revokes the whole session**; absolute session lifetime (60 d, or 1 d without "remember") |
| Cookies | `HttpOnly`, `Secure` (enforced in production), `SameSite=Strict`, path `/api/auth`. Access token is kept **in memory only** — never localStorage |
| CSRF | Double-submit token (`vt_csrf` cookie + `X-CSRF-Token`) and Origin allow-list on refresh/logout; all other endpoints use bearer tokens, which browsers never attach automatically |
| Logout / revocation | Logout revokes the session & its refresh tokens; "sign out everywhere", per-session revoke, password change/reset and account disable/role change revoke sessions |
| Email verification | Single-use hashed tokens (48 h); login blocked until verified |
| Password reset | Generic response regardless of account existence, hashed single-use tokens (1 h), previous tokens invalidated, all sessions revoked after reset |
| Brute force | Per (IP,email) and per-IP login throttling, per-account lockout after repeated failures, rate limits on register/verify/reset/AI/export/import, global per-IP limit |

## Authorization
* RBAC tables (`roles`, `permissions`): `user` = `tracking:own`; `admin` = + `admin:manage`. Public registration can only
  create `user`; admins are created with `python -m app.cli create-admin`.
* **Every** non-public endpoint depends on `get_current_user`; a test enumerates the OpenAPI schema and asserts 401 for
  every route without a token.
* Tenant isolation: all tracking queries filter by `user_id` from the verified token; foreign references are validated to
  belong to the same user (`invalid_reference`); foreign/missing ids both return 404 (no IDOR oracle). Admins see account
  metadata and audit events only — never tracking data. Tests cover cross-user read/update/delete/restore/duplicate for
  every module.

## Data protection
* AI provider credentials: Fernet (AES-128-CBC + HMAC) with `ENCRYPTION_KEY`; only a 4-character hint is stored in clear;
  keys are never returned, logged or included in exports; removing a provider hard-deletes the ciphertext. Error text from
  providers is scrubbed of key patterns.
* Cloud AI requires explicit per-provider consent and per-module opt-in; user text (notes/descriptions) is never sent;
  labels are sanitised and wrapped as untrusted data; no tools/DB access → prompt injection cannot cause actions.
* SSRF guard on user-supplied URLs (Ollama/HF endpoint): http(s) only, no embedded credentials, link-local/metadata
  addresses blocked; cloud endpoints must be https and public.
* Backups can be encrypted (scrypt + Fernet) and are written with 0600/0700 permissions; names are validated against a
  strict pattern (no path traversal); restore needs typed confirmation and takes a safety backup first.
* CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`).

## Application hardening
Input validation with Pydantic (types, ranges, enums, `extra="forbid"`), parameterised SQL via SQLAlchemy (user-supplied
sort/filter names are whitelisted), no `dangerouslySetInnerHTML` (React escapes output; AI markdown is rendered by a small
safe renderer), CORS allow-list, security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP `default-src
'none'` on the API, `Cache-Control: no-store`), request size limits, generic 500 responses (no stack traces), validation
errors never echo submitted values, audit log never stores secrets, docs/OpenAPI disabled in production.

## Known limits / operator duties
* Rate limiting and lockout state are in-memory (single process).
* `JWT_SECRET`/`ENCRYPTION_KEY`/`BACKUP_PASSPHRASE` must be backed up securely; rotating `ENCRYPTION_KEY` requires
  re-entering provider keys.
* Terminate TLS in front of the app and set `COOKIE_SECURE=true`.
* If a reverse proxy is used, configure it to forward the real client IP (rate limits key on the socket address by
  default).
