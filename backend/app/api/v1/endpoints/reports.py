from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Project, Student, Module, Skill
from app.core.security import get_current_student
from app.agents.report_agent import run_report_agent

router = APIRouter(prefix="/reports", tags=["Professional Report Generator"])


class ReportGenerateRequest(BaseModel):
    report_type: str  # 'project_analysis' | 'academic_transcript' | 'career_dossier'
    project_id: Optional[str] = None
    custom_notes: Optional[str] = None


@router.post("/generate")
async def generate_report_payload(
    req: ReportGenerateRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    mods = (await db.execute(select(Module).where(Module.student_id == student.id))).scalars().all()
    skills = (await db.execute(select(Skill).where(Skill.student_id == student.id))).scalars().all()

    project_data = None
    if req.project_id:
        proj_stmt = select(Project).where(Project.id == req.project_id, Project.student_id == student.id)
        project_data = (await db.execute(proj_stmt)).scalar_one_or_none()

    ctx = {
        "name": student.student_number,
        "university": student.university,
        "degree": student.degree,
        "gpa": student.gpa,
        "target_gpa": student.target_gpa,
        "credits_earned": student.credits_earned,
        "credits_required": student.credits_required,
        "modules": [{"code": m.code, "name": m.name, "final_mark": m.final_mark, "grade": m.grade, "credits": m.credits} for m in mods],
        "skills": [s.name for s in skills]
    }

    if req.report_type == "project_analysis" and project_data:
        report_text = f"""# PROFESSIONAL PROJECT ANALYSIS REPORT
**Project Title**: {project_data.title}
**Project Type**: {project_data.project_type}
**Date Generated**: Today

==================================================
1. EXECUTIVE SUMMARY & OVERVIEW
==================================================
{project_data.analysis_summary or project_data.description}

==================================================
2. ARCHITECTURE & SYSTEM DESIGN
==================================================
Pattern: {project_data.architecture or 'Modular Asynchronous Layered Architecture'}
Backend: {project_data.backend_info or 'Python FastAPI'}
Frontend: {project_data.frontend_info or 'React with TypeScript & Tailwind CSS'}
Database: {project_data.database_info or 'PostgreSQL with pgvector and SQLAlchemy ORM'}
Security: {project_data.security_info or 'JWT Bearer Authentication, Bcrypt Hashing, CORS Protection'}
AI Components: {project_data.ai_components or 'Multi-Agent LangGraph with Vector Embeddings'}

==================================================
3. TECHNOLOGIES & TOOLS USED
==================================================
{', '.join(project_data.technologies or ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'React', 'TypeScript'])}

==================================================
4. KEY STRENGTHS & DISTINCTIONS
==================================================
{chr(10).join(['- ' + s for s in (project_data.strengths or ['Clean modular separation', 'Type-safe contracts'])])}

==================================================
5. ACTIONABLE RECOMMENDATIONS & IMPROVEMENTS
==================================================
{chr(10).join(['- ' + imp for imp in (project_data.improvements or ['Add automated end-to-end integration test suites', 'Introduce Redis caching'])])}

==================================================
6. DEMONSTRATED SKILLS & CV VALUE
==================================================
{chr(10).join(['- ' + sk for sk in (project_data.skills_demonstrated or ['Full-Stack Development', 'API Design', 'Database Modeling'])])}

Career Relevance:
{project_data.career_value or 'High-value portfolio piece demonstrating end-to-end production readiness.'}
"""
        return {
            "title": f"Professional Project Analysis Report - {project_data.title}",
            "report_type": req.report_type,
            "markdown_content": report_text,
            "metadata": {
                "student_number": student.student_number,
                "project_title": project_data.title,
                "technologies": project_data.technologies
            }
        }

    # Academic transcript or dossier
    ai_report = await run_report_agent(f"Generate full {req.report_type} for {student.student_number}", ctx)

    return {
        "title": f"Academic & Portfolio Evaluation Dossier",
        "report_type": req.report_type,
        "markdown_content": ai_report["content"],
        "metadata": {
            "student_number": student.student_number,
            "gpa": student.gpa,
            "degree": student.degree,
            "modules_count": len(mods)
        }
    }
