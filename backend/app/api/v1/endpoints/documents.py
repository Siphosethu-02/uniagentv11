import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.db.session import get_db
from app.db.models import UploadedDocument, DocumentChunk, Student
from app.core.security import get_current_student
from app.rag.service import ingest_document, retrieve_relevant_chunks

router = APIRouter(prefix="/documents", tags=["RAG Document Ingestion & Retrieval"])


class SearchRequest(BaseModel):
    query: str
    top_k: int = settings.RAG_TOP_K
    similarity_threshold: float = settings.RAG_SIMILARITY_THRESHOLD


@router.get("")
async def list_documents(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(UploadedDocument).where(UploadedDocument.student_id == student.id).order_by(UploadedDocument.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/upload")
async def upload_document_endpoint(
    file: UploadFile = File(...),
    document_type: str = Form("general"),
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    # Validate file size
    file_bytes = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB"
        )

    # Validate file type
    filename = file.filename or "uploaded_file.txt"
    allowed_exts = [".pdf", ".docx", ".txt", ".md", ".json", ".py", ".csv"]
    if not any(filename.lower().endswith(ext) for ext in allowed_exts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format. Supported formats: {', '.join(allowed_exts)}"
        )

    doc = await ingest_document(
        db=db,
        student_id=student.id,
        filename=filename,
        original_name=filename,
        file_bytes=file_bytes,
        mime_type=file.content_type or "application/octet-stream",
        document_type=document_type
    )

    return {
        "id": doc.id,
        "filename": doc.filename,
        "original_name": doc.original_name,
        "total_chunks": doc.total_chunks,
        "document_type": doc.document_type,
        "status": doc.status,
        "file_size": doc.file_size
    }


@router.post("/search")
async def semantic_search_endpoint(
    req: SearchRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    """Query the pgvector index across the student's uploaded documents."""
    chunks = await retrieve_relevant_chunks(
        db=db,
        student_id=student.id,
        query=req.query,
        top_k=req.top_k,
        similarity_threshold=req.similarity_threshold
    )
    return {
        "query": req.query,
        "total_matches": len(chunks),
        "results": chunks
    }


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(DocumentChunk)
        .join(UploadedDocument, DocumentChunk.document_id == UploadedDocument.id)
        .where(DocumentChunk.document_id == document_id, UploadedDocument.student_id == student.id)
        .order_by(DocumentChunk.chunk_index)
    )
    res = await db.execute(stmt)
    chunks = res.scalars().all()
    return [
        {
            "id": c.id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "token_count": c.token_count,
            "has_embedding": c.embedding is not None
        }
        for c in chunks
    ]


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(UploadedDocument).where(UploadedDocument.id == document_id, UploadedDocument.student_id == student.id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    await db.delete(doc)
    await db.commit()
    return {"message": "Document and associated vector chunks removed successfully"}
