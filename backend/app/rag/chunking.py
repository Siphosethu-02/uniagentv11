from typing import List, Dict, Any
from app.config import settings


def split_text_into_chunks(
    text: str,
    chunk_size: int = settings.RAG_CHUNK_SIZE,
    chunk_overlap: int = settings.RAG_CHUNK_OVERLAP,
    metadata: Dict[str, Any] = None
) -> List[Dict[str, Any]]:
    """
    Split text into overlapping character-aware chunks.
    Respects paragraph and sentence boundaries where possible.
    """
    if not text or not text.strip():
        return []

    metadata = metadata or {}
    text = text.strip()
    chunks: List[Dict[str, Any]] = []

    # Clean whitespace
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    current_chunk = ""
    chunk_index = 0

    for paragraph in paragraphs:
        if len(current_chunk) + len(paragraph) + 1 <= chunk_size:
            if current_chunk:
                current_chunk += "\n" + paragraph
            else:
                current_chunk = paragraph
        else:
            if current_chunk:
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": current_chunk,
                    "token_count": len(current_chunk.split()),
                    "metadata": {**metadata, "chunk_index": chunk_index}
                })
                chunk_index += 1

                # Carry over overlap
                overlap_text = current_chunk[-chunk_overlap:] if len(current_chunk) > chunk_overlap else ""
                current_chunk = (overlap_text + " " + paragraph).strip()
            else:
                # Paragraph itself is larger than chunk_size, split by words
                words = paragraph.split()
                sub_chunk = ""
                for word in words:
                    if len(sub_chunk) + len(word) + 1 <= chunk_size:
                        sub_chunk = (sub_chunk + " " + word).strip()
                    else:
                        if sub_chunk:
                            chunks.append({
                                "chunk_index": chunk_index,
                                "content": sub_chunk,
                                "token_count": len(sub_chunk.split()),
                                "metadata": {**metadata, "chunk_index": chunk_index}
                            })
                            chunk_index += 1
                            overlap_words = sub_chunk.split()[-10:]
                            sub_chunk = (" ".join(overlap_words) + " " + word).strip()
                        else:
                            sub_chunk = word[:chunk_size]
                if sub_chunk:
                    current_chunk = sub_chunk

    if current_chunk:
        chunks.append({
            "chunk_index": chunk_index,
            "content": current_chunk,
            "token_count": len(current_chunk.split()),
            "metadata": {**metadata, "chunk_index": chunk_index}
        })

    return chunks
