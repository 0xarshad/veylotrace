from fastapi import APIRouter

from app.api.routes import ai, analytics, auth, challenges, data, settings
from app.api.routes.tracking import tracking_router

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(settings.router)
api_router.include_router(settings.admin)
api_router.include_router(data.router)
api_router.include_router(data.admin)
api_router.include_router(analytics.router)
api_router.include_router(challenges.router)
api_router.include_router(ai.router)
api_router.include_router(tracking_router())


@api_router.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
