from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    academic,
    projects,
    documents,
    career,
    chat,
    agents,
    reports,
    admin
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(academic.router)
api_router.include_router(projects.router)
api_router.include_router(documents.router)
api_router.include_router(career.router)
api_router.include_router(chat.router)
api_router.include_router(agents.router)
api_router.include_router(reports.router)
api_router.include_router(admin.router)
