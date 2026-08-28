import os
from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_ENV: str = "development"
    APP_NAME: str = "UniAgent"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_PREFIX: str = "/api/v1"

    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:5173,http://localhost:3000"

    SECRET_KEY: str = "uniagent_super_secret_jwt_key_please_change_in_production_32b"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "uniagent"
    POSTGRES_USER: str = "uniagent"
    POSTGRES_PASSWORD: str = "uniagent_secure_pass"

    DATABASE_URL: str = ""

    VECTOR_DIMENSIONS: int = 1536

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 4096

    RAG_CHUNK_SIZE: int = 512
    RAG_CHUNK_OVERLAP: int = 64
    RAG_TOP_K: int = 5
    RAG_SIMILARITY_THRESHOLD: float = 0.75

    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 20

    RATE_LIMIT_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    LOG_LEVEL: str = "INFO"
    ENABLE_AGENT_TRACING: bool = True

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Union[str, None], info) -> str:
        if isinstance(v, str) and v.strip():
            return v
        data = info.data
        user = data.get("POSTGRES_USER", "uniagent")
        password = data.get("POSTGRES_PASSWORD", "uniagent_secure_pass")
        host = data.get("POSTGRES_HOST", "db")
        port = data.get("POSTGRES_PORT", 5432)
        db = data.get("POSTGRES_DB", "uniagent")
        return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}"

    @property
    def cors_origins_list(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
