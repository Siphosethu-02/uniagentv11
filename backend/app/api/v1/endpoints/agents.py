from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import AgentRun, Student
from app.core.security import get_current_student, get_current_admin
from app.agents.orchestrator import execute_agent_request

router = APIRouter(prefix="/agents", tags=["Agent Registry & Telemetry"])


class DirectAgentQuery(BaseModel):
    query: str
    target_agent: Optional[str] = None


@router.get("/list")
async def list_available_agents():
    return [
        {
            "id": "orchestrator",
            "name": "Intelligent Orchestrator Agent",
            "description": "Auto-analyzes user queries and conditionally routes to domain-specialized agents.",
            "capabilities": ["Dynamic routing", "Intent classification", "Context injection"]
        },
        {
            "id": "academic",
            "name": "Academic Progression Agent",
            "description": "Calculates GPA goals, analyzes module marks, and optimizes study schedules.",
            "capabilities": ["GPA projections", "Mark tracking", "Study planner"]
        },
        {
            "id": "project",
            "name": "Project & AST Code Analysis Agent",
            "description": "Scans repository architectures, code strengths, vulnerabilities, and software patterns.",
            "capabilities": ["Static code heuristics", "Architecture review", "CV skills mapping"]
        },
        {
            "id": "career",
            "name": "Career & WIL Advisory Agent",
            "description": "Matches skills with tech industry demands, tracks internships, and coaches for technical interviews.",
            "capabilities": ["Skill gap analysis", "Resume bullet points", "Mock interviews"]
        },
        {
            "id": "document",
            "name": "RAG Document Retrieval Agent",
            "description": "Performs cosine similarity search against student course notes and cites exact chunks.",
            "capabilities": ["Vector search", "Document synthesis", "Source attribution"]
        },
        {
            "id": "support",
            "name": "Student Support & Wellbeing Agent",
            "description": "Advises on time management, campus procedures, mental health, and exam anxiety.",
            "capabilities": ["Time management", "University guidelines", "Student support"]
        },
        {
            "id": "report",
            "name": "Executive Report Generation Agent",
            "description": "Synthesizes formal performance reviews and project evaluation dossiers.",
            "capabilities": ["Formal transcripts", "Project audit reports", "PDF-ready dossiers"]
        }
    ]


@router.post("/query")
async def direct_agent_query(
    req: DirectAgentQuery,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    student_context = {
        "name": student.student_number,
        "degree": student.degree,
        "gpa": student.gpa,
        "target_gpa": student.target_gpa,
        "credits_earned": student.credits_earned,
        "credits_required": student.credits_required,
        "university": student.university
    }

    result = await execute_agent_request(
        query=req.query,
        student_context=student_context,
        target_agent_override=req.target_agent
    )
    return result


@router.get("/runs")
async def get_agent_runs(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentRun).where(AgentRun.student_id == student.id).order_by(AgentRun.created_at.desc()).limit(50)
    res = await db.execute(stmt)
    return res.scalars().all()
