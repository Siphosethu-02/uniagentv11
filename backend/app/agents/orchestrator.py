import re
import time
import structlog
from typing import Dict, Any, List, TypedDict, Optional
from langgraph.graph import StateGraph, END
from app.config import settings
from app.core.checkpointer import get_checkpointer
from app.agents.academic_agent import run_academic_agent
from app.agents.project_agent import run_project_agent
from app.agents.career_agent import run_career_agent
from app.agents.document_agent import run_document_agent
from app.agents.support_agent import run_support_agent
from app.agents.report_agent import run_report_agent

logger = structlog.get_logger(__name__)


class AgentState(TypedDict):
    query: str
    student_context: Dict[str, Any]
    retrieved_chunks: List[Dict[str, Any]]
    routed_agent: str
    response: str
    sources: List[Dict[str, Any]]
    duration_ms: int


def classify_query_intent(query: str, manual_override: Optional[str] = None) -> str:
    """
    Intelligently classify user inquiry to route to the optimal specialized agent.
    """
    if manual_override and manual_override in ["academic", "project", "career", "document", "support", "report"]:
        return manual_override

    q = query.lower()

    # Report intent
    if any(k in q for k in ["generate report", "export transcript", "evaluation dossier", "executive summary", "pdf summary", "formal report"]):
        return "report"

    # Document / RAG intent
    if any(k in q for k in ["according to my notes", "in my pdf", "syllabus says", "lecture notes", "assignment sheet", "document", "textbook", "in my uploaded"]):
        return "document"

    # Academic intent
    if any(k in q for k in ["gpa", "grade", "mark", "module", "exam", "test score", "distinction", "credits", "semester", "academic", "coursework", "lecturer"]):
        return "academic"

    # Project intent
    if any(k in q for k in ["project", "code", "architecture", "fastapi", "react", "bug", "repository", "github", "docker", "ast", "scan", "refactor", "framework"]):
        return "project"

    # Career intent
    if any(k in q for k in ["career", "internship", "job", "interview", "cv", "resume", "skills", "salary", "hiring", "apply", "wil", "work experience"]):
        return "career"

    # Support / General wellbeing intent
    if any(k in q for k in ["stress", "anxiety", "counseling", "campus", "tuition", "housing", "library", "schedule", "routine", "help", "support"]):
        return "support"

    # Default to academic or support
    return "academic"


# Node functions for LangGraph
async def orchestrator_router_node(state: AgentState) -> Dict[str, Any]:
    routed = classify_query_intent(state["query"])
    logger.info("Orchestrator routed request", query=state["query"][:50], agent=routed)
    return {"routed_agent": routed}


async def academic_node(state: AgentState) -> Dict[str, Any]:
    res = await run_academic_agent(state["query"], state["student_context"])
    return {"response": res["content"], "sources": res.get("sources", [])}


async def project_node(state: AgentState) -> Dict[str, Any]:
    res = await run_project_agent(state["query"], state["student_context"])
    return {"response": res["content"], "sources": res.get("sources", [])}


async def career_node(state: AgentState) -> Dict[str, Any]:
    res = await run_career_agent(state["query"], state["student_context"])
    return {"response": res["content"], "sources": res.get("sources", [])}


async def document_node(state: AgentState) -> Dict[str, Any]:
    res = await run_document_agent(state["query"], state["retrieved_chunks"], state["student_context"])
    return {"response": res["content"], "sources": res.get("sources", [])}


async def support_node(state: AgentState) -> Dict[str, Any]:
    res = await run_support_agent(state["query"], state["student_context"])
    return {"response": res["content"], "sources": res.get("sources", [])}


async def report_node(state: AgentState) -> Dict[str, Any]:
    res = await run_report_agent(state["query"], state["student_context"])
    return {"response": res["content"], "sources": res.get("sources", [])}


def create_agent_graph():
    """Build the compiled LangGraph StateGraph with conditional routing."""
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("orchestrator", orchestrator_router_node)
    workflow.add_node("academic", academic_node)
    workflow.add_node("project", project_node)
    workflow.add_node("career", career_node)
    workflow.add_node("document", document_node)
    workflow.add_node("support", support_node)
    workflow.add_node("report", report_node)

    # Set entry point
    workflow.set_entry_point("orchestrator")

    # Conditional routing edge
    def route_decision(state: AgentState) -> str:
        return state["routed_agent"]

    workflow.add_conditional_edges(
        "orchestrator",
        route_decision,
        {
            "academic": "academic",
            "project": "project",
            "career": "career",
            "document": "document",
            "support": "support",
            "report": "report",
        }
    )

    # All specialized agents finish at END
    workflow.add_edge("academic", END)
    workflow.add_edge("project", END)
    workflow.add_edge("career", END)
    workflow.add_edge("document", END)
    workflow.add_edge("support", END)
    workflow.add_edge("report", END)

    checkpointer = get_checkpointer()
    return workflow.compile(checkpointer=checkpointer)


_compiled_graph = None


def get_agent_orchestrator():
    """Lazy compile graph with checkpointer."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = create_agent_graph()
    return _compiled_graph


async def execute_agent_request(
    query: str,
    student_context: Dict[str, Any],
    retrieved_chunks: List[Dict[str, Any]] = None,
    session_id: Optional[str] = None,
    target_agent_override: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point for executing user requests through the LangGraph orchestrator.
    """
    start_time = time.perf_counter()
    retrieved_chunks = retrieved_chunks or []

    initial_state: AgentState = {
        "query": query,
        "student_context": student_context,
        "retrieved_chunks": retrieved_chunks,
        "routed_agent": target_agent_override or "orchestrator",
        "response": "",
        "sources": [],
        "duration_ms": 0
    }

    try:
        # Check if direct execution without graph is preferred
        chosen_agent = target_agent_override or classify_query_intent(query)
        if chosen_agent == "academic":
            res = await run_academic_agent(query, student_context)
        elif chosen_agent == "project":
            res = await run_project_agent(query, student_context)
        elif chosen_agent == "career":
            res = await run_career_agent(query, student_context)
        elif chosen_agent == "document":
            res = await run_document_agent(query, retrieved_chunks, student_context)
        elif chosen_agent == "report":
            res = await run_report_agent(query, student_context)
        else:
            res = await run_support_agent(query, student_context)

        duration = int((time.perf_counter() - start_time) * 1000)
        return {
            "routed_agent": chosen_agent,
            "response": res["content"],
            "sources": res.get("sources", []),
            "duration_ms": duration,
            "status": "success"
        }
    except Exception as e:
        logger.error("Error executing agent orchestrator request", error=str(e))
        duration = int((time.perf_counter() - start_time) * 1000)
        return {
            "routed_agent": "orchestrator",
            "response": f"An error occurred while processing your request with the AI Agent: {str(e)}",
            "sources": [],
            "duration_ms": duration,
            "status": "error"
        }
