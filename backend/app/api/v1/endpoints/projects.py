from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Project, ProjectDocument, Student
from app.core.security import get_current_student
from app.project_scanner.analyzer import analyze_project

router = APIRouter(prefix="/projects", tags=["Project Analysis System"])


class ProjectCreate(BaseModel):
    title: str
    description: str
    repository_url: Optional[str] = None
    live_url: Optional[str] = None
    project_type: str = "Full-Stack Web Application"
    status: str = "completed"
    files: Optional[List[Dict[str, str]]] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    repository_url: Optional[str] = None
    live_url: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None


class CodeScanRequest(BaseModel):
    title: str
    description: str
    files: List[Dict[str, str]]


@router.get("")
async def list_projects(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.student_id == student.id).order_by(Project.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("")
async def create_and_analyze_project(
    req: ProjectCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    files = req.files or [
        {"name": "main.py", "content": f"# Project: {req.title}\n# {req.description}\nfrom fastapi import FastAPI\napp = FastAPI()"}
    ]

    # Perform deep analysis
    analysis = await analyze_project(req.title, req.description, files)

    proj = Project(
        student_id=student.id,
        title=req.title,
        description=req.description,
        repository_url=req.repository_url,
        live_url=req.live_url,
        project_type=req.project_type,
        status=req.status,
        analysis_summary=analysis.get("project_overview"),
        technologies=analysis.get("technologies", []),
        architecture=analysis.get("architecture"),
        main_features=analysis.get("main_features", []),
        functionality=analysis.get("functionality"),
        database_info=analysis.get("database_info"),
        api_info=analysis.get("api_info"),
        frontend_info=analysis.get("frontend_info"),
        backend_info=analysis.get("backend_info"),
        ai_components=analysis.get("ai_components"),
        security_info=analysis.get("security_info"),
        strengths=analysis.get("strengths", []),
        weaknesses=analysis.get("weaknesses", []),
        improvements=analysis.get("improvements", []),
        skills_demonstrated=analysis.get("skills_demonstrated", []),
        career_value=analysis.get("career_value"),
        professional_summary=analysis.get("professional_summary"),
        code_metrics=analysis.get("code_metrics", {})
    )
    db.add(proj)
    await db.flush()

    for f in files:
        doc = ProjectDocument(
            project_id=proj.id,
            filename=f.get("name", "file.txt"),
            file_path=f"projects/{proj.id}/{f.get('name', 'file.txt')}",
            file_type=f.get("name", "").split(".")[-1] if "." in f.get("name", "") else "txt",
            file_size=len(f.get("content", "").encode("utf-8")),
            content=f.get("content", "")
        )
        db.add(doc)

    await db.commit()
    await db.refresh(proj)
    return proj


@router.get("/{project_id}")
async def get_project_detail(
    project_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id, Project.student_id == student.id)
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return proj


@router.post("/scan-preview")
async def scan_preview_only(req: CodeScanRequest):
    """Analyze code files on the fly without persisting to database."""
    analysis = await analyze_project(req.title, req.description, req.files)
    return analysis


@router.post("/{project_id}/reanalyze")
async def reanalyze_project_endpoint(
    project_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id, Project.student_id == student.id)
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    docs_stmt = select(ProjectDocument).where(ProjectDocument.project_id == proj.id)
    docs = (await db.execute(docs_stmt)).scalars().all()

    files = [{"name": d.filename, "content": d.content or ""} for d in docs] or [
        {"name": "app.py", "content": f"# {proj.title}\n{proj.description}"}
    ]

    analysis = await analyze_project(proj.title, proj.description, files)

    proj.analysis_summary = analysis.get("project_overview")
    proj.technologies = analysis.get("technologies", [])
    proj.architecture = analysis.get("architecture")
    proj.main_features = analysis.get("main_features", [])
    proj.functionality = analysis.get("functionality")
    proj.database_info = analysis.get("database_info")
    proj.api_info = analysis.get("api_info")
    proj.frontend_info = analysis.get("frontend_info")
    proj.backend_info = analysis.get("backend_info")
    proj.ai_components = analysis.get("ai_components")
    proj.security_info = analysis.get("security_info")
    proj.strengths = analysis.get("strengths", [])
    proj.weaknesses = analysis.get("weaknesses", [])
    proj.improvements = analysis.get("improvements", [])
    proj.skills_demonstrated = analysis.get("skills_demonstrated", [])
    proj.career_value = analysis.get("career_value")
    proj.professional_summary = analysis.get("professional_summary")
    proj.code_metrics = analysis.get("code_metrics", {})

    await db.commit()
    await db.refresh(proj)
    return proj


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id, Project.student_id == student.id)
    proj = (await db.execute(stmt)).scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await db.delete(proj)
    await db.commit()
    return {"message": "Project deleted successfully"}
