import pytest
from app.project_scanner.analyzer import scan_code_heuristics, analyze_project


def test_static_code_heuristics():
    files = [
        {"name": "server.py", "content": "from fastapi import FastAPI\nimport sqlalchemy\napp = FastAPI()"},
        {"name": "App.tsx", "content": "import React from 'react';\nimport tailwindcss from 'tailwindcss';"},
        {"name": "Dockerfile", "content": "FROM python:3.11\nCMD ['uvicorn']"}
    ]

    metrics = scan_code_heuristics(files)
    assert metrics["file_count"] == 3
    assert "Python" in metrics["detected_languages"]
    assert "TypeScript (React)" in metrics["detected_languages"] or "TypeScript" in metrics["detected_languages"]
    assert "FastAPI" in metrics["detected_frameworks"]
    assert metrics["has_docker"] is True
    assert metrics["has_database"] is True


@pytest.mark.asyncio
async def test_project_analysis_runner():
    files = [
        {"name": "main.py", "content": "from fastapi import FastAPI\nimport pgvector\napp = FastAPI()"}
    ]
    report = await analyze_project("Distributed Vector DB", "High speed vector similarity engine", files)

    assert "project_overview" in report
    assert "architecture" in report
    assert "strengths" in report
    assert len(report["strengths"]) > 0
    assert "skills_demonstrated" in report
