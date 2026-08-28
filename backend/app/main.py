from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.db.session import init_db
from app.core.checkpointer import init_checkpointer, close_checkpointer
from app.api.v1.router import api_router

logger = structlog.get_logger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.RATE_LIMIT_REQUESTS}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting UniAgent Backend...", env=settings.APP_ENV, version=settings.APP_VERSION)
    try:
        await init_db()
    except Exception as e:
        logger.warning("Database startup notice (will retry on incoming requests if DB container is still launching)", error=str(e))

    try:
        await init_checkpointer()
    except Exception as e:
        logger.warning("Checkpointer startup notice", error=str(e))

    yield

    # Shutdown
    logger.info("Shutting down UniAgent Backend...")
    await close_checkpointer()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="UNiAGENT — Production AI University Student Agent Platform",
    lifespan=lifespan,
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
)

# Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Lightweight health endpoint that returns immediately without expensive AI or DB overhead.
    Used by Docker healthchecks and Kubernetes probes.
    """
    return {
        "status": "healthy",
        "service": "UniAgent",
        "version": settings.APP_VERSION
    }


# Include API v1 Router
app.include_router(api_router, prefix=settings.API_PREFIX)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled server exception", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. The issue has been logged."}
    )
