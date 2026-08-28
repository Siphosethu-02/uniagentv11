import asyncio
import structlog
from sqlalchemy import select
from app.db.session import AsyncSessionLocal, init_db
from app.db.models import (
    User, Student, AcademicRecord, Module, Grade,
    Project, ProjectDocument, Skill, CareerProfile,
    Internship, UploadedDocument, DocumentChunk, ChatSession, ChatMessage, AgentRun
)
from app.core.security import get_password_hash
from app.rag.embeddings import get_embeddings_batch

logger = structlog.get_logger(__name__)


async def seed_database():
    await init_db()
    async with AsyncSessionLocal() as session:
        # Check if already seeded
        existing_user = (await session.execute(select(User).where(User.email == "student@uniagent.edu"))).scalar_one_or_none()
        if existing_user:
            logger.info("Database is already seeded with default student and admin accounts.")
            return

        logger.info("Seeding database with production demo data...")

        # 1. Admin User
        admin_user = User(
            email="admin@uniagent.edu",
            hashed_password=get_password_hash("admin123"),
            full_name="Dr. Sarah Vance (Department Head)",
            role="admin",
            is_active=True
        )
        session.add(admin_user)

        # 2. Student User & Profile
        student_user = User(
            email="student@uniagent.edu",
            hashed_password=get_password_hash("student123"),
            full_name="Alex Chen",
            role="student",
            is_active=True
        )
        session.add(student_user)
        await session.flush()

        student = Student(
            user_id=student_user.id,
            student_number="CHNALE001",
            university="University of Cape Town",
            degree="BSc Computer Science & Applied Mathematics",
            major="Artificial Intelligence & Distributed Systems",
            year_of_study=3,
            gpa=3.86,
            target_gpa=4.00,
            credits_earned=288,
            credits_required=360,
            status="active"
        )
        session.add(student)
        await session.flush()

        # 3. Academic Records & Modules
        modules_data = [
            {
                "code": "CSC3002F",
                "name": "Advanced Operating Systems & Concurrency",
                "credits": 18,
                "semester": "Semester 1",
                "year": 2024,
                "lecturer": "Prof. David Thorne",
                "status": "completed",
                "target_mark": 85.0,
                "final_mark": 88.5,
                "grade": "1st Class",
                "is_distinction": True,
                "syllabus_summary": "Kernel architecture, process synchronization, paging, memory barriers, virtual filesystems."
            },
            {
                "code": "CSC3003S",
                "name": "Artificial Intelligence & Reinforcement Learning",
                "credits": 18,
                "semester": "Semester 2",
                "year": 2024,
                "lecturer": "Dr. Amina Patel",
                "status": "in_progress",
                "target_mark": 90.0,
                "final_mark": None,
                "grade": None,
                "is_distinction": False,
                "syllabus_summary": "Deep Q-Networks, Policy Gradients, Transformer self-attention, Markov Decision Processes."
            },
            {
                "code": "MAM2000W",
                "name": "Linear Algebra & Multivariable Calculus",
                "credits": 24,
                "semester": "Year Course",
                "year": 2023,
                "lecturer": "Dr. Hendrik Venter",
                "status": "completed",
                "target_mark": 80.0,
                "final_mark": 84.0,
                "grade": "1st Class",
                "is_distinction": True,
                "syllabus_summary": "Spectral decomposition, Jordan forms, vector calculus, Stokes theorem, Fourier transforms."
            },
            {
                "code": "CSC2001F",
                "name": "Data Structures, Algorithms & Complexity",
                "credits": 24,
                "semester": "Semester 1",
                "year": 2023,
                "lecturer": "Prof. Michelle Kroll",
                "status": "completed",
                "target_mark": 85.0,
                "final_mark": 91.0,
                "grade": "1st Class",
                "is_distinction": True,
                "syllabus_summary": "Red-black trees, Dijkstra, A*, dynamic programming, NP-completeness, amortized analysis."
            },
            {
                "code": "INF3003F",
                "name": "Cloud Infrastructure & Microservice Architecture",
                "credits": 18,
                "semester": "Semester 1",
                "year": 2024,
                "lecturer": "Dr. Ryan Botha",
                "status": "completed",
                "target_mark": 80.0,
                "final_mark": 79.5,
                "grade": "1st Class",
                "is_distinction": True,
                "syllabus_summary": "Kubernetes orchestration, distributed tracing, event streaming with Kafka, CAP theorem."
            }
        ]

        for mod_dict in modules_data:
            mod = Module(student_id=student.id, **mod_dict)
            session.add(mod)
            await session.flush()

            # Add grade items
            g1 = Grade(
                module_id=mod.id,
                assessment_name="Midterm Examination",
                weight_percent=30.0,
                score=86.0,
                max_score=100.0,
                percentage=86.0,
                feedback="Excellent algorithmic derivation and rigorous mathematical proofs."
            )
            g2 = Grade(
                module_id=mod.id,
                assessment_name="Practical Capstone Project",
                weight_percent=40.0,
                score=92.0,
                max_score=100.0,
                percentage=92.0,
                feedback="High quality code submission with automated test suite and dockerization."
            )
            session.add_all([g1, g2])

        # 4. Projects with Deep Structured Analysis
        p1 = Project(
            student_id=student.id,
            title="Distributed Neural Search & RAG Vector Pipeline",
            description="High-throughput semantic document retrieval engine with hybrid sparse-dense vector indexing and PostgreSQL pgvector store.",
            repository_url="https://github.com/alexchen/neural-search-rag",
            live_url="https://neural-search-rag.demo.internal",
            project_type="Full-Stack AI System",
            status="completed",
            analysis_summary="Production-grade vector search pipeline capable of sub-25ms semantic document ranking across 100k+ embeddings.",
            technologies=["Python", "FastAPI", "PostgreSQL", "pgvector", "LangGraph", "Docker", "React", "TypeScript", "Tailwind CSS"],
            architecture="Asynchronous Layered Microservice with Connection Pooling and IVFFlat Vector Indexing",
            main_features=[
                "High-performance cosine vector similarity matching",
                "Multi-agent orchestrator for domain-specific query routing",
                "Automated PDF and DOCX character-aware chunking pipeline",
                "Real-time latency tracking and token telemetry dashboard"
            ],
            functionality="Accepts document uploads, extracts textual tokens, computes OpenAI embeddings, inserts vectors into PostgreSQL with cosine distance operators, and responds to natural language queries.",
            database_info="PostgreSQL 16 with pgvector extension, ivfflat cosine operator index, and SQLAlchemy async session management.",
            api_info="FastAPI asynchronous endpoints with Pydantic request validation, rate limiting, and JWT bearer authentication.",
            frontend_info="Vite + React 18 SPA with responsive Tailwind CSS, dynamic radar charts, and markdown code block rendering.",
            backend_info="Python 3.11 with Uvicorn ASGI server and asyncpg non-blocking connection pool.",
            ai_components="OpenAI text-embedding-3-small vectors (1536 dims) and GPT-4o-mini multi-agent prompt chains.",
            security_info="Bcrypt password hashing, JWT Bearer tokens, CORS origin whitelisting, and SQL parameterized queries.",
            strengths=[
                "Strict typing with TypeScript and Pydantic across all data contracts",
                "Robust error handling and graceful fallbacks when external AI APIs timeout",
                "Clean modular architecture with single-responsibility services"
            ],
            weaknesses=[
                "Distributed cache (e.g. Redis) could further reduce repeated query latency",
                "Integration test suite could include adversarial prompt injection tests"
            ],
            improvements=[
                "Implement Redis caching for hot vector queries",
                "Add Prometheus / OpenTelemetry instrumentation",
                "Deploy CI/CD GitHub Actions test pipeline"
            ],
            skills_demonstrated=["Full-Stack Engineering", "Vector Databases", "LangGraph Multi-Agent Systems", "FastAPI", "React"],
            career_value="Exceptional flagship capstone project demonstrating production readiness in modern AI systems engineering.",
            professional_summary="Architected full-stack RAG pipeline using FastAPI, PostgreSQL pgvector, and LangGraph, achieving 99.4% precision in semantic retrieval.",
            code_metrics={"file_count": 28, "total_lines_of_code": 3420, "detected_languages": ["Python", "TypeScript", "SQL"], "has_docker": True, "has_tests": True}
        )

        p2 = Project(
            student_id=student.id,
            title="Autonomous Mobile Robot SLAM & Path Planning",
            description="Simultaneous Localization and Mapping system using Extended Kalman Filters (EKF) and A* path planning in simulated Gazebo environments.",
            repository_url="https://github.com/alexchen/robotics-slam-ros2",
            live_url=None,
            project_type="Robotics & Algorithms",
            status="completed",
            analysis_summary="C++ and Python implementation of LiDAR odometry fusion and probabilistic grid mapping.",
            technologies=["C++", "Python", "ROS2", "OpenCV", "Eigen", "Gazebo", "CMake"],
            architecture="Node-based Publisher-Subscriber Architecture on ROS2 Middleware",
            main_features=["2D LiDAR pointcloud filtering", "Real-time occupancy grid mapping", "Dynamic obstacle avoidance"],
            functionality="Subscribes to LiDAR laser scans and wheel odometry, updates state covariance via EKF, and publishes motor velocity commands.",
            database_info="Flatfile ROS2 bag data logging and pointcloud binary serialization.",
            api_info="ROS2 message protocols and action servers.",
            frontend_info="RViz2 visualization canvas with custom pointcloud overlays.",
            backend_info="High-performance C++20 nodes with real-time execution threads.",
            ai_components="Heuristic state-space search algorithms (A*, D* Lite).",
            security_info="Isolated containerized ROS network.",
            strengths=["Low memory footprint and sub-5ms control loop latency", "Clean mathematical formulations in Eigen"],
            weaknesses=["Requires physical calibration parameters for real-world deployment"],
            improvements=["Add 3D visual SLAM with stereo cameras"],
            skills_demonstrated=["C++", "Robotics Algorithms", "Linear Algebra", "State Estimation"],
            career_value="High industrial relevance for autonomous vehicles, robotics, and embedded systems roles.",
            professional_summary="Implemented real-time SLAM and A* trajectory planner in C++/ROS2 for mobile robots.",
            code_metrics={"file_count": 14, "total_lines_of_code": 1850, "detected_languages": ["C++", "Python", "CMake"], "has_docker": True, "has_tests": True}
        )

        session.add_all([p1, p2])
        await session.flush()

        # 5. Skills Matrix
        skills_data = [
            ("Python", "technical", "expert", 95),
            ("TypeScript & React", "technical", "advanced", 90),
            ("FastAPI & REST APIs", "technical", "expert", 92),
            ("PostgreSQL & pgvector", "technical", "advanced", 88),
            ("LangGraph & Multi-Agent Systems", "technical", "advanced", 86),
            ("Docker & Containerization", "tool", "advanced", 85),
            ("Algorithms & Data Structures", "domain", "expert", 92),
            ("Git & CI/CD Pipelines", "tool", "advanced", 88),
            ("Technical Communication", "soft", "advanced", 85),
            ("Team Leadership", "soft", "intermediate", 80),
        ]

        for name, cat, level, percent in skills_data:
            sk = Skill(
                student_id=student.id,
                name=name,
                category=cat,
                proficiency_level=level,
                proficiency_percent=percent,
                verified=True,
                source="project"
            )
            session.add(sk)

        # 6. Career Profile & Internships
        career = CareerProfile(
            student_id=student.id,
            target_roles=["AI Systems Engineer", "Full-Stack Software Engineer", "Machine Learning Infrastructure Engineer"],
            desired_industries=["Artificial Intelligence", "Cloud Infrastructure", "Fintech", "Robotics"],
            preferred_locations=["Cape Town", "London", "San Francisco (Remote)"],
            target_salary_range="$85,000 - $120,000 / year",
            bio="Third-year Computer Science student passionate about distributed systems, vector retrieval, and autonomous multi-agent pipelines.",
            linkedin_url="https://linkedin.com/in/alexchen-tech",
            github_url="https://github.com/alexchen",
            career_readiness_score=88
        )
        session.add(career)

        internships_data = [
            {
                "company_name": "Google Cloud",
                "role_title": "Software Engineering Intern - Cloud AI",
                "status": "interviewing",
                "location": "London / Hybrid",
                "notes": "Technical Round 2 scheduled next Tuesday. Topic: Concurrency and System Design.",
                "salary_stipend": "£3,800 / month"
            },
            {
                "company_name": "Amazon Web Services (AWS)",
                "role_title": "Cloud Infrastructure Intern",
                "status": "offered",
                "location": "Cape Town",
                "notes": "Offer letter received for Summer 2025 internship. 12-week program.",
                "salary_stipend": "R35,000 / month"
            },
            {
                "company_name": "DeepMind",
                "role_title": "AI Research Engineering Intern",
                "status": "applied",
                "location": "London / Remote",
                "notes": "Application submitted with neural vector search project portfolio and professor reference.",
                "salary_stipend": "£4,200 / month"
            }
        ]

        for int_dict in internships_data:
            intern = Internship(student_id=student.id, **int_dict)
            session.add(intern)

        # 7. Uploaded Documents with RAG Chunks & Embeddings
        sample_doc_content = """# CSC3002F: Advanced Operating Systems Course Syllabus
## Module Overview
This module explores kernel development, multi-threaded synchronization primitives, virtual memory management, and file systems.

### Assessment Structure
1. Midterm Examination: 30% weighting, covers processes, threads, semaphores, and deadlocks.
2. Final Capstone Project: 40% weighting, implementing a userspace preemptive thread scheduler in C++.
3. Weekly Lab Problem Sets: 30% weighting.

### Key Policies
- Distinctions are awarded for cumulative course marks >= 75%.
- Submissions must adhere to memory leak prevention (Valgrind verified).
- Academic integrity is strictly enforced with automated plagiarism scanners.
"""

        doc = UploadedDocument(
            student_id=student.id,
            filename="CSC3002F_Course_Syllabus.pdf",
            original_name="CSC3002F_Course_Syllabus.pdf",
            mime_type="application/pdf",
            file_size=len(sample_doc_content.encode("utf-8")),
            total_chunks=3,
            document_type="syllabus",
            status="processed"
        )
        session.add(doc)
        await session.flush()

        chunks_text = [
            "CSC3002F Course Syllabus: Assessment weighting includes 30% Midterm Exam on concurrency, 40% Capstone Project on thread schedulers, and 30% Weekly Labs.",
            "CSC3002F Distinction Criteria: A cumulative mark of 75% or higher earns a First-Class Distinction. Valgrind memory leak verification is required.",
            "CSC3002F Kernel Architecture: Topics include synchronization primitives (mutexes, semaphores, condition variables), virtual paging, and page fault resolution."
        ]

        embeddings = await get_embeddings_batch(chunks_text)
        for i, (txt, emb) in enumerate(zip(chunks_text, embeddings)):
            chunk_obj = DocumentChunk(
                document_id=doc.id,
                chunk_index=i,
                content=txt,
                embedding=emb,
                token_count=len(txt.split()),
                metadata_json={"filename": doc.original_name, "chunk_index": i}
            )
            session.add(chunk_obj)

        # 8. Sample Chat Session & Messages
        chat_sess = ChatSession(
            student_id=student.id,
            title="Academic Guidance & Distinction Strategy",
            active_agent="academic"
        )
        session.add(chat_sess)
        await session.flush()

        m1 = ChatMessage(
            session_id=chat_sess.id,
            role="user",
            sender_agent="user",
            content="What mark do I need in my remaining CSC3003S assignments to graduate with a 3.9 GPA?"
        )
        m2 = ChatMessage(
            session_id=chat_sess.id,
            role="assistant",
            sender_agent="academic",
            content="""### GPA Projection & Target Calculation

Hello **Alex**, let's analyze your academic trajectory:

- **Current GPA**: `3.86` across 288 credits
- **Target GPA**: `4.00`
- **Enrolled Module**: **CSC3003S** (18 credits)

#### Required Performance:
To elevate your overall GPA toward `3.90+`:
1. You need a **minimum of 88%** in CSC3003S.
2. Ensure your practical Capstone implementation scores **90%+**, as it holds a 40% weighting.
3. This will secure another **First-Class Distinction** and solidify your top 5% class ranking.
""",
            sources_json=[{"type": "academic_record", "title": "BSc Computer Science Transcript"}],
            latency_ms=320,
            tokens_used=145
        )
        session.add_all([m1, m2])

        await session.commit()
        logger.info("Database seeding completed successfully! Demo accounts: student@uniagent.edu / student123, admin@uniagent.edu / admin123")


if __name__ == "__main__":
    asyncio.run(seed_database())
