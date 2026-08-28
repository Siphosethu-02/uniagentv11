import pytest
from app.rag.chunking import split_text_into_chunks
from app.rag.embeddings import generate_deterministic_embedding, cosine_similarity


def test_chunking_algorithm():
    sample_text = """Paragraph 1 with detailed syllabus content for operating systems.
Paragraph 2 explaining multi-threaded concurrency and mutex primitives.
Paragraph 3 regarding grading criteria and distinctions."""

    chunks = split_text_into_chunks(sample_text, chunk_size=80, chunk_overlap=20)
    assert len(chunks) >= 2
    for c in chunks:
        assert "content" in c
        assert "chunk_index" in c
        assert c["token_count"] > 0


def test_embeddings_and_cosine_similarity():
    v1 = generate_deterministic_embedding("Advanced Computer Science Algorithms", dim=1536)
    v2 = generate_deterministic_embedding("Advanced Computer Science Algorithms", dim=1536)
    v3 = generate_deterministic_embedding("Completely unrelated culinary recipe for pasta", dim=1536)

    assert len(v1) == 1536
    # Exact match similarity should be 1.0
    sim_exact = cosine_similarity(v1, v2)
    assert abs(sim_exact - 1.0) < 1e-4

    # Unrelated vector similarity should be significantly lower
    sim_diff = cosine_similarity(v1, v3)
    assert sim_diff < 0.95
