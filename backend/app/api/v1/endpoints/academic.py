from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.session import get_db
from app.db.models import Module, Grade, Student
from app.core.security import get_current_student

router = APIRouter(prefix="/academic", tags=["Academic Dashboard"])


class GradeCreate(BaseModel):
    assessment_name: str
    weight_percent: float
    score: float
    max_score: float = 100.0
    feedback: Optional[str] = None


class ModuleCreate(BaseModel):
    code: str
    name: str
    credits: int = 18
    semester: str = "Semester 1"
    year: int = 2024
    lecturer: Optional[str] = None
    status: str = "in_progress"  # 'in_progress', 'completed', 'planned'
    target_mark: float = 80.0
    final_mark: Optional[float] = None
    grade: Optional[str] = None
    is_distinction: bool = False
    syllabus_summary: Optional[str] = None


class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    credits: Optional[int] = None
    semester: Optional[str] = None
    year: Optional[int] = None
    lecturer: Optional[str] = None
    status: Optional[str] = None
    target_mark: Optional[float] = None
    final_mark: Optional[float] = None
    grade: Optional[str] = None
    is_distinction: Optional[bool] = None
    syllabus_summary: Optional[str] = None


@router.get("/modules")
async def get_modules(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Module).where(Module.student_id == student.id).order_by(Module.year.desc(), Module.semester)
    res = await db.execute(stmt)
    modules = res.scalars().all()
    return modules


@router.post("/modules")
async def create_module(
    req: ModuleCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    # calculate distinction automatically if mark >= 75
    is_dist = req.is_distinction or (req.final_mark is not None and req.final_mark >= 75.0)

    mod = Module(
        student_id=student.id,
        code=req.code.upper(),
        name=req.name,
        credits=req.credits,
        semester=req.semester,
        year=req.year,
        lecturer=req.lecturer,
        status=req.status,
        target_mark=req.target_mark,
        final_mark=req.final_mark,
        grade=req.grade or ("1st" if req.final_mark and req.final_mark >= 75 else "2nd"),
        is_distinction=is_dist,
        syllabus_summary=req.syllabus_summary
    )
    db.add(mod)
    await db.commit()
    await db.refresh(mod)
    return mod


@router.put("/modules/{module_id}")
async def update_module(
    module_id: str,
    req: ModuleUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Module).where(Module.id == module_id, Module.student_id == student.id)
    mod = (await db.execute(stmt)).scalar_one_or_none()
    if not mod:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    update_data = req.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(mod, field, val)

    # Recompute is_distinction from the (possibly just-updated) final_mark,
    # unless the caller explicitly set is_distinction in this same request.
    if "is_distinction" not in update_data:
        mod.is_distinction = mod.final_mark is not None and mod.final_mark >= 75.0

    await db.commit()
    await db.refresh(mod)
    return mod


@router.delete("/modules/{module_id}")
async def delete_module(
    module_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Module).where(Module.id == module_id, Module.student_id == student.id)
    mod = (await db.execute(stmt)).scalar_one_or_none()
    if not mod:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    await db.delete(mod)
    await db.commit()
    return {"message": "Module deleted successfully"}


@router.get("/stats")
async def get_academic_stats(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Module).where(Module.student_id == student.id)
    modules = (await db.execute(stmt)).scalars().all()

    completed = [m for m in modules if m.status == "completed" and m.final_mark is not None]
    in_progress = [m for m in modules if m.status == "in_progress"]
    planned = [m for m in modules if m.status == "planned"]

    distinctions = len([m for m in completed if m.is_distinction or (m.final_mark and m.final_mark >= 75.0)])
    avg_mark = sum([m.final_mark for m in completed]) / len(completed) if completed else None
    total_credits = sum([m.credits for m in completed])

    # Semester trends calculation
    semesters = {}
    for m in completed:
        sem_key = f"{m.year} {m.semester}"
        if sem_key not in semesters:
            semesters[sem_key] = {"marks": [], "credits": 0}
        semesters[sem_key]["marks"].append(m.final_mark)
        semesters[sem_key]["credits"] += m.credits

    trends = [
        {
            "semester": sem,
            "average": round(sum(d["marks"]) / len(d["marks"]), 1),
            "credits": d["credits"]
        }
        for sem, d in semesters.items()
    ]

    return {
        "gpa": student.gpa,
        "target_gpa": student.target_gpa,
        "credits_earned": total_credits or student.credits_earned,
        "credits_required": student.credits_required,
        "average_mark": round(avg_mark, 2) if avg_mark is not None else None,
        "total_modules": len(modules),
        "completed_modules": len(completed),
        "in_progress_modules": len(in_progress),
        "planned_modules": len(planned),
        "distinctions": distinctions,
        "distinction_rate_percent": round((distinctions / len(completed) * 100), 1) if completed else None,
        "trends": trends
    }
