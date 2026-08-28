"""Initial database schema with pgvector

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-08-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import pgvector.sqlalchemy

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), default="student", index=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), default=sa.func.now())
    )

    # students
    op.create_table(
        "students",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True),
        sa.Column("student_number", sa.String(50), unique=True, index=True, nullable=False),
        sa.Column("university", sa.String(255), default="University of Cape Town"),
        sa.Column("degree", sa.String(255), default="BSc Computer Science"),
        sa.Column("major", sa.String(255), default="Artificial Intelligence & Software Engineering"),
        sa.Column("year_of_study", sa.Integer(), default=3),
        sa.Column("gpa", sa.Float(), default=3.82),
        sa.Column("target_gpa", sa.Float(), default=4.0),
        sa.Column("credits_earned", sa.Integer(), default=240),
        sa.Column("credits_required", sa.Integer(), default=360),
        sa.Column("status", sa.String(50), default="active"),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), default=sa.func.now())
    )

    # academic_records
    op.create_table(
        "academic_records",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("academic_year", sa.Integer(), nullable=False),
        sa.Column("semester", sa.String(50), nullable=False),
        sa.Column("semester_gpa", sa.Float(), default=0.0),
        sa.Column("credits_attempted", sa.Integer(), default=0),
        sa.Column("credits_passed", sa.Integer(), default=0),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # modules
    op.create_table(
        "modules",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("code", sa.String(50), index=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("credits", sa.Integer(), default=18),
        sa.Column("semester", sa.String(50), default="Semester 1"),
        sa.Column("year", sa.Integer(), default=2024),
        sa.Column("lecturer", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), default="completed"),
        sa.Column("target_mark", sa.Float(), default=80.0),
        sa.Column("final_mark", sa.Float(), nullable=True),
        sa.Column("grade", sa.String(10), nullable=True),
        sa.Column("is_distinction", sa.Boolean(), default=False),
        sa.Column("syllabus_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # grades
    op.create_table(
        "grades",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("module_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("modules.id", ondelete="CASCADE"), index=True),
        sa.Column("assessment_name", sa.String(255), nullable=False),
        sa.Column("weight_percent", sa.Float(), default=20.0),
        sa.Column("score", sa.Float(), default=0.0),
        sa.Column("max_score", sa.Float(), default=100.0),
        sa.Column("percentage", sa.Float(), default=0.0),
        sa.Column("date_achieved", sa.DateTime(), default=sa.func.now()),
        sa.Column("feedback", sa.Text(), nullable=True)
    )

    # projects
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("repository_url", sa.String(500), nullable=True),
        sa.Column("live_url", sa.String(500), nullable=True),
        sa.Column("project_type", sa.String(100), default="Full-Stack Web App"),
        sa.Column("status", sa.String(50), default="completed"),
        sa.Column("analysis_summary", sa.Text(), nullable=True),
        sa.Column("technologies", sa.JSON(), default=list),
        sa.Column("architecture", sa.Text(), nullable=True),
        sa.Column("main_features", sa.JSON(), default=list),
        sa.Column("functionality", sa.Text(), nullable=True),
        sa.Column("database_info", sa.Text(), nullable=True),
        sa.Column("api_info", sa.Text(), nullable=True),
        sa.Column("frontend_info", sa.Text(), nullable=True),
        sa.Column("backend_info", sa.Text(), nullable=True),
        sa.Column("ai_components", sa.Text(), nullable=True),
        sa.Column("security_info", sa.Text(), nullable=True),
        sa.Column("strengths", sa.JSON(), default=list),
        sa.Column("weaknesses", sa.JSON(), default=list),
        sa.Column("improvements", sa.JSON(), default=list),
        sa.Column("skills_demonstrated", sa.JSON(), default=list),
        sa.Column("career_value", sa.Text(), nullable=True),
        sa.Column("professional_summary", sa.Text(), nullable=True),
        sa.Column("code_metrics", sa.JSON(), default=dict),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), default=sa.func.now())
    )

    # project_documents
    op.create_table(
        "project_documents",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.Integer(), default=0),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # skills
    op.create_table(
        "skills",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(50), default="technical"),
        sa.Column("proficiency_level", sa.String(50), default="intermediate"),
        sa.Column("proficiency_percent", sa.Integer(), default=75),
        sa.Column("verified", sa.Boolean(), default=False),
        sa.Column("source", sa.String(100), default="project"),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # career_profiles
    op.create_table(
        "career_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), unique=True, index=True),
        sa.Column("target_roles", sa.JSON(), default=list),
        sa.Column("desired_industries", sa.JSON(), default=list),
        sa.Column("preferred_locations", sa.JSON(), default=list),
        sa.Column("target_salary_range", sa.String(100), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("linkedin_url", sa.String(255), nullable=True),
        sa.Column("github_url", sa.String(255), nullable=True),
        sa.Column("resume_data", sa.JSON(), default=dict),
        sa.Column("career_readiness_score", sa.Integer(), default=85),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), default=sa.func.now())
    )

    # internships
    op.create_table(
        "internships",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("role_title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), default="applied"),
        sa.Column("application_date", sa.DateTime(), default=sa.func.now()),
        sa.Column("deadline", sa.DateTime(), nullable=True),
        sa.Column("location", sa.String(255), default="Remote / Cape Town"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("salary_stipend", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # uploaded_documents
    op.create_table(
        "uploaded_documents",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), default="application/pdf"),
        sa.Column("file_size", sa.Integer(), default=0),
        sa.Column("total_chunks", sa.Integer(), default=0),
        sa.Column("document_type", sa.String(50), default="general"),
        sa.Column("status", sa.String(50), default="processed"),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # document_chunks with pgvector Vector(1536)
    op.create_table(
        "document_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("uploaded_documents.id", ondelete="CASCADE"), index=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(1536), nullable=True),
        sa.Column("token_count", sa.Integer(), default=0),
        sa.Column("metadata_json", sa.JSON(), default=dict),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # ivfflat cosine-distance index for pgvector similarity search.
    # Without this, document_chunks.embedding lookups fall back to a full
    # sequential scan as the table grows (this mirrors the index declared
    # on the DocumentChunk model's __table_args__).
    op.create_index(
        "idx_doc_chunks_embedding",
        "document_chunks",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # chat_sessions
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("title", sa.String(255), default="New Academic Inquiry"),
        sa.Column("active_agent", sa.String(100), default="orchestrator"),
        sa.Column("metadata_json", sa.JSON(), default=dict),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), default=sa.func.now())
    )

    # chat_messages
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("sender_agent", sa.String(100), default="orchestrator"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources_json", sa.JSON(), default=list),
        sa.Column("latency_ms", sa.Integer(), default=0),
        sa.Column("tokens_used", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )

    # agent_runs
    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=False), nullable=True, index=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("students.id", ondelete="CASCADE"), index=True),
        sa.Column("agent_name", sa.String(100), index=True, nullable=False),
        sa.Column("status", sa.String(50), default="success"),
        sa.Column("input_prompt", sa.Text(), nullable=True),
        sa.Column("output_result", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), default=0),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now())
    )


def downgrade() -> None:
    op.drop_table("agent_runs")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("document_chunks")
    op.drop_table("uploaded_documents")
    op.drop_table("internships")
    op.drop_table("career_profiles")
    op.drop_table("skills")
    op.drop_table("project_documents")
    op.drop_table("projects")
    op.drop_table("grades")
    op.drop_table("modules")
    op.drop_table("academic_records")
    op.drop_table("students")
    op.drop_table("users")
