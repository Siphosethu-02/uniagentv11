from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import User, Student, CareerProfile
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    student_number: str
    university: str = "University of Cape Town"
    degree: str = "BSc Computer Science"
    major: str = "Software Engineering & AI"
    # NOTE: role is intentionally NOT accepted here. Public self-registration
    # always creates a "student" account; admin accounts must be provisioned
    # by an existing admin via PUT /admin/users/{user_id}/role.


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    stmt = select(User).where(User.email == req.email.lower())
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )

    # Create User. Public self-registration can only ever create a
    # "student" account - role is never taken from client input here.
    new_user = User(
        email=req.email.lower(),
        hashed_password=get_password_hash(req.password),
        full_name=req.full_name,
        role="student",
        is_active=True
    )
    db.add(new_user)
    await db.flush()

    # If student role, create student profile & career profile
    if new_user.role == "student":
        new_student = Student(
            user_id=new_user.id,
            student_number=req.student_number,
            university=req.university,
            degree=req.degree,
            major=req.major,
            year_of_study=3,
            gpa=3.82,
            target_gpa=4.0,
            credits_earned=240,
            credits_required=360,
            status="active"
        )
        db.add(new_student)
        await db.flush()

        career = CareerProfile(
            student_id=new_student.id,
            target_roles=["AI Engineer", "Full-Stack Software Engineer"],
            desired_industries=["Artificial Intelligence", "Fintech", "Cloud Platforms"],
            career_readiness_score=85
        )
        db.add(career)

    await db.commit()

    access_token = create_access_token({"sub": new_user.id, "email": new_user.email, "role": new_user.role})
    refresh_token = create_refresh_token({"sub": new_user.id})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role
        }
    }


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == req.email.lower())
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account is disabled")

    access_token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    refresh_token = create_refresh_token({"sub": user.id})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }


@router.post("/refresh")
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token type")

    user_id = payload.get("sub")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer active")

    new_access = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    return {"access_token": new_access, "token_type": "bearer"}


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    student_data = None
    if current_user.role == "student":
        stmt = select(Student).where(Student.user_id == current_user.id)
        student = (await db.execute(stmt)).scalar_one_or_none()
        if student:
            student_data = {
                "id": student.id,
                "student_number": student.student_number,
                "university": student.university,
                "degree": student.degree,
                "major": student.major,
                "year_of_study": student.year_of_study,
                "gpa": student.gpa,
                "target_gpa": student.target_gpa,
                "credits_earned": student.credits_earned,
                "credits_required": student.credits_required,
                "status": student.status
            }

    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "student": student_data
    }
