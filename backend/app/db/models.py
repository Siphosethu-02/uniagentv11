import uuid
from datetime import datetime
from typing import List, Optional, Any
from sqlalchemy import (
    String, Boolean, Integer, Float, Text, ForeignKey, DateTime, Index, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from app.db.session import Base
from app.config import settings


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="student", index=True)  # 'student' | 'admin'
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student: Mapped[Optional["Student"]] = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    student_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    university: Mapped[str] = mapped_column(String(255), default="University of Cape Town")
    degree: Mapped[str] = mapped_column(String(255), default="BSc Computer Science")
    major: Mapped[str] = mapped_column(String(255), default="Artificial Intelligence & Software Engineering")
    year_of_study: Mapped[int] = mapped_column(Integer, default=3)
    gpa: Mapped[float] = mapped_column(Float, default=3.82)
    target_gpa: Mapped[float] = mapped_column(Float, default=4.0)
    credits_earned: Mapped[int] = mapped_column(Integer, default=240)
    credits_required: Mapped[int] = mapped_column(Integer, default=360)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="student")
    academic_records: Mapped[List["AcademicRecord"]] = relationship("AcademicRecord", back_populates="student", cascade="all, delete-orphan")
    modules: Mapped[List["Module"]] = relationship("Module", back_populates="student", cascade="all, delete-orphan")
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="student", cascade="all, delete-orphan")
    skills: Mapped[List["Skill"]] = relationship("Skill", back_populates="student", cascade="all, delete-orphan")
    career_profile: Mapped[Optional["CareerProfile"]] = relationship("CareerProfile", back_populates="student", uselist=False, cascade="all, delete-orphan")
    internships: Mapped[List["Internship"]] = relationship("Internship", back_populates="student", cascade="all, delete-orphan")
    uploaded_documents: Mapped[List["UploadedDocument"]] = relationship("UploadedDocument", back_populates="student", cascade="all, delete-orphan")
    chat_sessions: Mapped[List["ChatSession"]] = relationship("ChatSession", back_populates="student", cascade="all, delete-orphan")


class AcademicRecord(Base):
    __tablename__ = "academic_records"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    academic_year: Mapped[int] = mapped_column(Integer, nullable=False)
    semester: Mapped[str] = mapped_column(String(50), nullable=False)  # 'Semester 1', 'Semester 2', 'Winter'
    semester_gpa: Mapped[float] = mapped_column(Float, default=0.0)
    credits_attempted: Mapped[int] = mapped_column(Integer, default=0)
    credits_passed: Mapped[int] = mapped_column(Integer, default=0)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="academic_records")


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, default=18)
    semester: Mapped[str] = mapped_column(String(50), default="Semester 1")
    year: Mapped[int] = mapped_column(Integer, default=2024)
    lecturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="completed")  # 'completed', 'in_progress', 'planned'
    target_mark: Mapped[float] = mapped_column(Float, default=80.0)
    final_mark: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_distinction: Mapped[bool] = mapped_column(Boolean, default=False)
    syllabus_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="modules")
    grades: Mapped[List["Grade"]] = relationship("Grade", back_populates="module", cascade="all, delete-orphan")


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    module_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("modules.id", ondelete="CASCADE"), index=True)
    assessment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    weight_percent: Mapped[float] = mapped_column(Float, default=20.0)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=100.0)
    percentage: Mapped[float] = mapped_column(Float, default=0.0)
    date_achieved: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    module: Mapped["Module"] = relationship("Module", back_populates="grades")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    repository_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    live_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    project_type: Mapped[str] = mapped_column(String(100), default="Full-Stack Web App")
    status: Mapped[str] = mapped_column(String(50), default="completed")  # 'in_progress', 'completed', 'archived'

    # Deep structured analysis fields
    analysis_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    technologies: Mapped[Optional[Any]] = mapped_column(JSON, default=list)  # list of strings
    architecture: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    main_features: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    functionality: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    database_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    api_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    frontend_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    backend_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_components: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    security_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strengths: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    weaknesses: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    improvements: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    skills_demonstrated: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    career_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    professional_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    code_metrics: Mapped[Optional[Any]] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="projects")
    documents: Mapped[List["ProjectDocument"]] = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")


class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship("Project", back_populates="documents")


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="technical")  # 'technical', 'soft', 'domain', 'tool'
    proficiency_level: Mapped[str] = mapped_column(String(50), default="intermediate")  # 'beginner', 'intermediate', 'advanced', 'expert'
    proficiency_percent: Mapped[int] = mapped_column(Integer, default=75)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(100), default="project")  # 'project', 'academic', 'manual'
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="skills")


class CareerProfile(Base):
    __tablename__ = "career_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), unique=True, index=True)
    target_roles: Mapped[Optional[Any]] = mapped_column(JSON, default=list)  # list of strings
    desired_industries: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    preferred_locations: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    target_salary_range: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    github_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    resume_data: Mapped[Optional[Any]] = mapped_column(JSON, default=dict)
    career_readiness_score: Mapped[int] = mapped_column(Integer, default=85)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="career_profile")


class Internship(Base):
    __tablename__ = "internships"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="applied")  # 'wishlist', 'applied', 'interviewing', 'offered', 'rejected', 'accepted', 'completed'
    application_date: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), default="Remote / Cape Town")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    salary_stipend: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="internships")


class UploadedDocument(Base):
    __tablename__ = "uploaded_documents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/pdf")
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0)
    document_type: Mapped[str] = mapped_column(String(50), default="general")  # 'syllabus', 'assignment', 'lecture_note', 'transcript', 'cv', 'general'
    status: Mapped[str] = mapped_column(String(50), default="processed")  # 'pending', 'processing', 'processed', 'failed'
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="uploaded_documents")
    chunks: Mapped[List["DocumentChunk"]] = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("uploaded_documents.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[Any]] = mapped_column(Vector(settings.VECTOR_DIMENSIONS), nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[Optional[Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["UploadedDocument"] = relationship("UploadedDocument", back_populates="chunks")

    __table_args__ = (
        Index("idx_doc_chunks_embedding", "embedding", postgresql_using="ivfflat", postgresql_ops={"embedding": "vector_cosine_ops"}),
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="New Academic Inquiry")
    active_agent: Mapped[str] = mapped_column(String(100), default="orchestrator")
    metadata_json: Mapped[Optional[Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student: Mapped["Student"] = relationship("Student", back_populates="chat_sessions")
    messages: Mapped[List["ChatMessage"]] = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # 'user', 'assistant', 'system'
    sender_agent: Mapped[str] = mapped_column(String(100), default="orchestrator")  # 'orchestrator', 'academic', 'project', 'career', 'document', 'support', 'report'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources_json: Mapped[Optional[Any]] = mapped_column(JSON, default=list)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=generate_uuid)
    session_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), nullable=True, index=True)
    student_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    agent_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="success")  # 'started', 'success', 'failed'
    input_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
