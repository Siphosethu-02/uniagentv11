from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import User, Student
from app.core.security import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    university: Optional[str] = None
    degree: Optional[str] = None
    major: Optional[str] = None
    student_number: Optional[str] = None
    year_of_study: Optional[int] = None
    target_gpa: Optional[float] = None


@router.get("/profile")
async def get_user_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    student_data = None
    if current_user.role == "student":
        stmt = select(Student).where(Student.user_id == current_user.id)
        student = (await db.execute(stmt)).scalar_one_or_none()
        if student:
            student_data = {
                "student_number": student.student_number,
                "university": student.university,
                "degree": student.degree,
                "major": student.major,
                "year_of_study": student.year_of_study,
                "gpa": student.gpa,
                "target_gpa": student.target_gpa,
                "credits_earned": student.credits_earned,
                "credits_required": student.credits_required
            }

    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "student": student_data
    }


@router.put("/profile")
async def update_user_profile(
    req: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if req.full_name:
        current_user.full_name = req.full_name

    if current_user.role == "student":
        stmt = select(Student).where(Student.user_id == current_user.id)
        student = (await db.execute(stmt)).scalar_one_or_none()
        if student:
            if req.university:
                student.university = req.university
            if req.degree:
                student.degree = req.degree
            if req.major:
                student.major = req.major
            if req.student_number:
                student.student_number = req.student_number
            if req.year_of_study:
                student.year_of_study = req.year_of_study
            if req.target_gpa:
                student.target_gpa = req.target_gpa

    await db.commit()
    return {"message": "Profile updated successfully"}
