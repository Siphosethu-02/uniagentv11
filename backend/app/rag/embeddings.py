import hashlib
import math
import structlog
from typing import List
from openai import AsyncOpenAI
from app.config import settings

logger = structlog.get_logger(__name__)

_openai_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI | None:
    global _openai_client
    if _openai_client is None and settings.OPENAI_API_KEY:
        _openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


def generate_deterministic_embedding(text: str, dim: int = 1536) -> List[float]:
    """
    Generate normalized pseudo-vector from text hash when OpenAI key is absent.
    Ensures vector similarity and RAG search testability in development/mock environments.
    """
    vector = []
    text_bytes = text.encode("utf-8")
    for i in range(dim):
        h = hashlib.sha256(text_bytes + str(i).encode("utf-8")).digest()
        val = (int.from_bytes(h[:4], "big") / 0xFFFFFFFF) * 2.0 - 1.0
        vector.append(val)

    # Normalize vector to unit length
    magnitude = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / magnitude for x in vector]


async def get_embedding(text: str) -> List[float]:
    """Generate 1536-dim embedding vector via OpenAI text-embedding-3-small or fallback."""
    client = get_openai_client()
    if client and settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("YOUR_"):
        try:
            response = await client.embeddings.create(
                model=settings.OPENAI_EMBEDDING_MODEL,
                input=text[:8000],
            )
            return response.data[0].embedding
        except Exception as e:
            logger.warning("OpenAI embedding API failed, falling back to deterministic embedding", error=str(e))

    return generate_deterministic_embedding(text, settings.VECTOR_DIMENSIONS)


async def get_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """Batch embed multiple text chunks."""
    if not texts:
        return []

    client = get_openai_client()
    if client and settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("YOUR_"):
        try:
            # Chunk into batches of 32
            embeddings: List[List[float]] = []
            for i in range(0, len(texts), 32):
                batch = [t[:8000] for t in texts[i:i+32]]
                resp = await client.embeddings.create(
                    model=settings.OPENAI_EMBEDDING_MODEL,
                    input=batch
                )
                embeddings.extend([d.embedding for d in resp.data])
            return embeddings
        except Exception as e:
            logger.warning("Batch OpenAI embedding API failed, falling back", error=str(e))

    return [generate_deterministic_embedding(t, settings.VECTOR_DIMENSIONS) for t in texts]


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculate cosine similarity between two unit-normalized vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = math.sqrt(sum(a * a for a in v1)) or 1.0
    mag2 = math.sqrt(sum(b * b for b in v2)) or 1.0
    return dot / (mag1 * mag2)
