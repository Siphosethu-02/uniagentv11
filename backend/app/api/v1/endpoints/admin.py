from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import User, Student, Project, UploadedDocument, AgentRun, Module
from app.core.security import get_current_admin

router = APIRouter(prefix="/admin", tags=["Admin Portal"])

ALLOWED_ROLES = {"student", "admin"}


class RoleUpdateRequest(BaseModel):
    role: str  # 'student' | 'admin'

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ALLOWED_ROLES:
            raise ValueError(f"role must be one of {sorted(ALLOWED_ROLES)}")
        return v


@router.get("/users")
async def list_all_users(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).order_by(User.created_at.desc())
    users = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at
        }
        for u in users
    ]


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    req: RoleUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = req.role
    await db.commit()
    return {"message": f"User role updated to {req.role}"}


@router.get("/system-health")
async def get_system_health(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_students = (await db.execute(select(func.count(Student.id)))).scalar_one()
    total_projects = (await db.execute(select(func.count(Project.id)))).scalar_one()
    total_documents = (await db.execute(select(func.count(UploadedDocument.id)))).scalar_one()
    total_runs = (await db.execute(select(func.count(AgentRun.id)))).scalar_one()

    return {
        "status": "operational",
        "database": "PostgreSQL 16 with pgvector",
        "checkpointer": "AsyncPostgresSaver active",
        "multi_agent_system": "LangGraph StateGraph",
        "total_users": total_users,
        "total_students": total_students,
        "total_projects": total_projects,
        "total_documents": total_documents,
        "total_agent_runs": total_runs
    }


@router.get("/agent-telemetry")
async def get_agent_telemetry(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AgentRun).order_by(AgentRun.created_at.desc()).limit(100)
    runs = (await db.execute(stmt)).scalars().all()
    return runs
