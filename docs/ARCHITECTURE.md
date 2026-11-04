# Architecture

```
frontend/ (React + Vite)                 backend/ (FastAPI)
  pages/  one page per sidebar item        app/api/routes/   HTTP layer (auth, tracking, analytics, ai, data, settings)
  crud/   config-driven CRUD UI            app/core/         config, security (JWT/Argon2/Fernet), deps (authN/authZ), errors, rate limit
  components/ui, charts  design system     app/services/     business logic: analytics, insights, challenges, portability, backup, ai/*
  api/client.ts  token in memory,          app/models/       SQLAlchemy models (43 tables)
    single-flight refresh                  app/schemas/      Pydantic request/response validation
                                           alembic/          migrations (applied on start-up)
```

## Request flow

`Browser → /api (same origin proxy) → middleware (rate limit, size limit, security headers, CORS allowlist) → router →
dependency (verify JWT → load live session + user from DB → permission check) → service → SQLAlchemy (always filtered by the authenticated user id)`.

## Tracking modules (generic CRUD engine)

`app/services/crud.py` builds a router from a `Spec` (model, create schema, search/filter/sort whitelist, FK ownership
checks, hooks). Every module (expenses, income, transfers, budgets, savings goals/contributions, workouts, steps, sleep,
foods, meals, water, books, reading, screen time, habits, tasks, goals, skills, courses, study, social, challenges)
gets the same endpoints: list (search, date range, filters, pagination, `deleted=true`), create, read, update
(PUT/PATCH), soft delete, restore, permanent delete and duplicate. Because ownership, validation and soft-delete live in
one place, every module has identical isolation guarantees. Module-specific rules are small hooks in
`app/api/routes/tracking.py` (e.g. subcategory must belong to its category, sleep duration derived from times, one steps
entry per day, task completion timestamps).

Schemas use `extra="forbid"`: clients cannot send `user_id`, `id` or timestamps.

## Data model highlights

* Every user-owned table has `user_id` (FK, cascade), `created_at`, `updated_at`, and (except child rows) `deleted_at`.
* Wall-clock fields (`occurred_at`, `eaten_at`, …) are stored as the user's local time so "today" always matches what
  the user sees; security timestamps are UTC (`UTCDateTime`).
* Money is `NUMERIC(12,2)` / `Decimal`; transfers between own accounts are a separate table and are never expense/income.
* Savings contributions are recorded explicitly; **unspent budget is never treated as savings**.
* Meal item nutrition is per serving; totals are `quantity × value` (computed, never stored).
* Book reading progress, goal progress and challenge progress are **derived** from other records (no duplicate entry,
  nothing counted twice).
* Auth: `users`, `roles`, `permissions`, `role_permissions`, `auth_sessions`, `refresh_tokens` (hashed), `email_tokens`
  (hashed). `audit_events` for security-sensitive operations.
* AI: `ai_provider_configs` (encrypted keys), `ai_conversations/messages`, `ai_reports`, `ai_request_logs` — separate from
  tracking data.

## Analytics engine

`app/services/analytics.py` is the single source of numbers for the dashboard, reports, challenges, exports and AI
facts. It is deterministic SQL/Python over live (non-deleted) rows. `insights.py` implements the explainable expense rules
(budget overruns, category over allocation, unusual purchases vs 90-day category history, food spending increase,
frequent small transactions, recurring expenses, essential vs non-essential).

## AI design (optional, isolated)

* Own sidebar item and routes (`/api/ai/*`); nothing AI-related is returned by `/api/dashboard` (covered by a test).
* `services/ai/providers/` — one adapter per provider behind `ProviderAdapter` (`list_models`, `chat`, `test`):
  Groq/OpenAI/Anthropic via official SDKs, Ollama via its REST API, Hugging Face via the Inference Providers router or a
  dedicated endpoint URL. Register a new adapter in `providers/__init__.py`; nothing else changes.
* `assistant.py` builds **verified statistics** with the analytics engine → sanitises labels → sends them in `<data>` tags
  with a system prompt that demands the four sections *Observed facts / Calculated metrics / Potential patterns /
  Recommendations*, date ranges, and "missing data ≠ not done". The model has no tools and no DB access (read-only by
  construction); notes/descriptions/participants are never sent.
* Users opt in (`ai_enabled`), choose allowed modules, and give explicit consent per external provider. Ollama on
  localhost needs no consent. **No automatic fallback** between providers — failures are reported.

## Scaling notes

The rate limiter, login throttling and backup scheduler are in-process, so run **one worker** for a personal deployment.
To scale out, replace `RateLimiter` with Redis, move the scheduler to cron/systemd, and switch `DATABASE_URL` to
PostgreSQL (see OPERATIONS.md); the data-access layer uses portable SQLAlchemy only.
