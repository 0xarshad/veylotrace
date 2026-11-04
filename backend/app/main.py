import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.ratelimit import limiter
from app.db.session import SessionLocal, get_engine
from app.services.auth import seed_roles

log = logging.getLogger("veylotrace")


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    from app.core.config import BASE_DIR

    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    cfg.attributes["configured"] = True
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    s.validate_secrets()
    if s.app_env != "test":
        run_migrations()
    with SessionLocal() as db:
        seed_roles(db)
    from app.services.backup import start_scheduler, stop_scheduler

    start_scheduler()
    yield
    stop_scheduler()
    get_engine().dispose()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="VeyloTrace API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None if s.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if s.is_production else "/api/openapi.json",
    )
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
        max_age=600,
    )

    @app.middleware("http")
    async def guard(request: Request, call_next):
        ip = request.client.host if request.client else "unknown"
        ok, retry = limiter.hit(f"global:{ip}", get_settings().general_rate_limit_per_minute, 60)
        if not ok:
            return JSONResponse(
                {"error": {"code": "rate_limited", "message": "Too many requests. Please slow down."}},
                status_code=429,
                headers={"Retry-After": str(retry)},
            )
        limit = 25_000_000 if request.url.path == "/api/data/import" else 1_000_000
        if int(request.headers.get("content-length") or 0) > limit:
            return JSONResponse({"error": {"code": "payload_too_large", "message": "Request body is too large."}}, status_code=413)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if not request.url.path.startswith("/api/docs"):
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        return response

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
