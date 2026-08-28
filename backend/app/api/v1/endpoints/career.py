from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Skill, CareerProfile, Internship, Student
from app.core.security import get_current_student
from app.agents.career_agent import run_career_agent

router = APIRouter(prefix="/career", tags=["Career & Internship Dashboard"])


class CareerProfileUpdate(BaseModel):
    target_roles: Optional[List[str]] = None
    desired_industries: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    target_salary_range: Optional[str] = None
    bio: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    career_readiness_score: Optional[int] = None


class SkillCreate(BaseModel):
    name: str
    category: str = "technical"  # 'technical', 'soft', 'domain', 'tool'
    proficiency_level: str = "intermediate"  # 'beginner', 'intermediate', 'advanced', 'expert'
    proficiency_percent: int = 75
    source: str = "manual"


class InternshipCreate(BaseModel):
    company_name: str
    role_title: str
    status: str = "applied"  # 'wishlist', 'applied', 'interviewing', 'offered', 'rejected', 'accepted', 'completed'
    deadline: Optional[str] = None
    location: str = "Remote / Hybrid"
    notes: Optional[str] = None
    salary_stipend: Optional[str] = None


class InternshipUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    deadline: Optional[str] = None
    salary_stipend: Optional[str] = None


class CareerAdviceRequest(BaseModel):
    question: str
    target_role: Optional[str] = None


@router.get("/profile")
async def get_career_profile(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(CareerProfile).where(CareerProfile.student_id == student.id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        profile = CareerProfile(
            student_id=student.id,
            target_roles=["AI Engineer", "Full-Stack Software Engineer"],
            desired_industries=["Artificial Intelligence", "Cloud Computing"],
            career_readiness_score=85
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.put("/profile")
async def update_career_profile(
    req: CareerProfileUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(CareerProfile).where(CareerProfile.student_id == student.id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        profile = CareerProfile(student_id=student.id)
        db.add(profile)

    data = req.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(profile, k, v)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/skills")
async def get_skills(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Skill).where(Skill.student_id == student.id).order_by(Skill.proficiency_percent.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/skills")
async def create_skill(
    req: SkillCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    skill = Skill(
        student_id=student.id,
        name=req.name,
        category=req.category,
        proficiency_level=req.proficiency_level,
        proficiency_percent=req.proficiency_percent,
        source=req.source,
        verified=True
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Skill).where(Skill.id == skill_id, Skill.student_id == student.id)
    skill = (await db.execute(stmt)).scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    await db.delete(skill)
    await db.commit()
    return {"message": "Skill deleted"}


@router.get("/internships")
async def get_internships(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Internship).where(Internship.student_id == student.id).order_by(Internship.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/internships")
async def create_internship(
    req: InternshipCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    intern = Internship(
        student_id=student.id,
        company_name=req.company_name,
        role_title=req.role_title,
        status=req.status,
        location=req.location,
        notes=req.notes,
        salary_stipend=req.salary_stipend
    )
    db.add(intern)
    await db.commit()
    await db.refresh(intern)
    return intern


@router.put("/internships/{internship_id}")
async def update_internship(
    internship_id: str,
    req: InternshipUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Internship).where(Internship.id == internship_id, Internship.student_id == student.id)
    intern = (await db.execute(stmt)).scalar_one_or_none()
    if not intern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internship not found")

    data = req.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(intern, k, v)

    await db.commit()
    await db.refresh(intern)
    return intern


@router.delete("/internships/{internship_id}")
async def delete_internship(
    internship_id: str,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Internship).where(Internship.id == internship_id, Internship.student_id == student.id)
    intern = (await db.execute(stmt)).scalar_one_or_none()
    if not intern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internship not found")

    await db.delete(intern)
    await db.commit()
    return {"message": "Internship record deleted"}


@router.post("/ai-advice")
async def get_career_advice_endpoint(
    req: CareerAdviceRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db)
):
    skills_stmt = select(Skill).where(Skill.student_id == student.id)
    skills = (await db.execute(skills_stmt)).scalars().all()

    profile_stmt = select(CareerProfile).where(CareerProfile.student_id == student.id)
    profile = (await db.execute(profile_stmt)).scalar_one_or_none()

    ctx = {
        "name": student.student_number,
        "skills": [{"name": s.name, "proficiency_level": s.proficiency_level} for s in skills],
        "career_profile": {
            "target_roles": profile.target_roles if profile else ["AI Engineer"],
        }
    }

    advice = await run_career_agent(req.question, ctx)
    return advice
