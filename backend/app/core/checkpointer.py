import structlog
from typing import Optional
from psycopg_pool import AsyncConnectionPool
from app.config import settings

logger = structlog.get_logger(__name__)

# Global checkpointer instances
_pg_pool: Optional[AsyncConnectionPool] = None
_checkpointer = None


def get_postgres_connection_string() -> str:
    """Return standard psycopg3 compatible connection string."""
    return f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"


async def init_checkpointer():
    """Initialize LangGraph AsyncPostgresSaver checkpointer for long-lived state graph runs."""
    global _pg_pool, _checkpointer
    conn_str = get_postgres_connection_string()

    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        logger.info("Initializing LangGraph PostgreSQL checkpointer connection pool...", host=settings.POSTGRES_HOST)

        _pg_pool = AsyncConnectionPool(
            conninfo=conn_str,
            max_size=10,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            open=False,
        )
        await _pg_pool.open()

        _checkpointer = AsyncPostgresSaver(_pg_pool)
        await _checkpointer.setup()
        logger.info("LangGraph AsyncPostgresSaver checkpointer initialized and migration tables ready")
        return _checkpointer
    except Exception as e:
        logger.warning(
            "PostgreSQL checkpointer could not be initialized (falling back to lightweight state tracker for development)",
            error=str(e),
            postgres_host=settings.POSTGRES_HOST
        )
        try:
            from langgraph.checkpoint.memory import MemorySaver
            _checkpointer = MemorySaver()
            logger.info("MemorySaver fallback active for local development/testing")
            return _checkpointer
        except Exception as mem_err:
            logger.error("Failed to initialize fallback checkpointer", error=str(mem_err))
            return None


async def close_checkpointer():
    """Close the checkpointer connection pool safely during application shutdown."""
    global _pg_pool, _checkpointer
    if _pg_pool:
        try:
            await _pg_pool.close()
            logger.info("LangGraph PostgreSQL checkpointer pool closed cleanly")
        except Exception as e:
            logger.error("Error closing checkpointer pool", error=str(e))
        finally:
            _pg_pool = None
            _checkpointer = None


def get_checkpointer():
    """Return the active checkpointer instance."""
    return _checkpointer
