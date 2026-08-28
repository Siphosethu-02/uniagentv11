import time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.session import get_db
from app.db.models import ChatSession, ChatMessage, AgentRun, Student, Module, Project, Skill, UploadedDocument
from app.core.security import get_current_student
from app.rag.service import retrieve_relevant_chunks
from app.agents.orchestrator import execute_agent_request

router = APIRouter(prefix="/chat", tags=["Multi-Agent AI Chat"])


class SessionCreate(BaseModel):
    title: Optional[str] = "New Academic Session"
    active_agent: Optional[str] = "orchestrator"


class SendMessageRequest(BaseModel):
    content: str
    target_agent_override: Optional[str] = None  # None for auto-orchestration


@router.get("/sessions")
async def list_sessions(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.student_id == student.id).order_by(ChatSession.updated_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/sessions")
async def create_session(
    req: SessionCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    session = ChatSession(
        student_id=student.id,
        title=req.title or "New Academic Session",
        active_agent=req.active_agent or "orchestrator"
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.student_id == student.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    await db.delete(session)
    await db.commit()
    return {"message": "Chat session deleted"}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.student_id == student.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    msg_stmt = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
    res = await db.execute(msg_stmt)
    return res.scalars().all()


@router.post("/sessions/{session_id}/messages")
async def send_chat_message(
    session_id: str,
    req: SendMessageRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    # Verify session
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.student_id == student.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # 1. Save user message
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        sender_agent="user",
        content=req.content
    )
    db.add(user_msg)
    await db.flush()

    # 2. Gather student context
    mods_res = await db.execute(select(Module).where(Module.student_id == student.id))
    modules = mods_res.scalars().all()

    projs_res = await db.execute(select(Project).where(Project.student_id == student.id))
    projects = projs_res.scalars().all()

    skills_res = await db.execute(select(Skill).where(Skill.student_id == student.id))
    skills = skills_res.scalars().all()

    student_context = {
        "name": student.student_number,
        "degree": student.degree,
        "gpa": student.gpa,
        "target_gpa": student.target_gpa,
        "credits_earned": student.credits_earned,
        "credits_required": student.credits_required,
        "university": student.university,
        "modules": [{"code": m.code, "name": m.name, "final_mark": m.final_mark, "target_mark": m.target_mark, "status": m.status, "credits": m.credits} for m in modules],
        "projects": [{"title": p.title, "description": p.description, "technologies": p.technologies or [], "project_type": p.project_type} for p in projects],
        "skills": [{"name": s.name, "proficiency_level": s.proficiency_level} for s in skills]
    }

    # 3. Retrieve RAG chunks if relevant
    retrieved_chunks = await retrieve_relevant_chunks(
        db=db,
        student_id=student.id,
        query=req.content,
        top_k=5
    )

    # 4. Invoke Multi-Agent Orchestrator
    agent_output = await execute_agent_request(
        query=req.content,
        student_context=student_context,
        retrieved_chunks=retrieved_chunks,
        session_id=session_id,
        target_agent_override=req.target_agent_override
    )

    # 5. Save assistant response
    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        sender_agent=agent_output["routed_agent"],
        content=agent_output["response"],
        sources_json=agent_output.get("sources", []),
        latency_ms=agent_output.get("duration_ms", 0),
        tokens_used=len(agent_output["response"].split())
    )
    db.add(assistant_msg)

    # Update session active agent
    session.active_agent = agent_output["routed_agent"]

    # Log Agent Run for telemetry
    agent_run = AgentRun(
        session_id=session_id,
        student_id=student.id,
        agent_name=agent_output["routed_agent"],
        status="success" if agent_output.get("status") != "error" else "failed",
        input_prompt=req.content,
        output_result=agent_output["response"][:1000],
        duration_ms=agent_output.get("duration_ms", 0)
    )
    db.add(agent_run)

    await db.commit()
    await db.refresh(assistant_msg)

    return {
        "user_message": user_msg,
        "assistant_message": assistant_msg,
        "routed_agent": agent_output["routed_agent"],
        "sources": agent_output.get("sources", [])
    }
