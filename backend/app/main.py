from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.errors import error_body, register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.ratelimit import limiter
from app.db.session import SessionLocal
from app.services import push_service
from app.services.upload_service import public_dir


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="EMS Food API",
        version=settings.app_version,
        description="Internal daily food-ordering API for Engineering Management Systems.",
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
    )
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            error_body("RATE_LIMITED", "Too many requests. Please wait a moment and try again."),
            status_code=429,
        )

    register_exception_handlers(app)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID", "Accept-Language"],
        expose_headers=["Content-Disposition", "X-Request-ID"],
    )
    app.include_router(api_router, prefix="/api/v1")
    app.mount(settings.media_url_prefix, StaticFiles(directory=public_dir()), name="media")
    return app


if get_settings().push_enabled:
    push_service.install_after_commit_hook(SessionLocal)
app = create_app()
