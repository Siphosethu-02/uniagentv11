import structlog
from typing import Dict, Any
from openai import AsyncOpenAI
from app.config import settings

logger = structlog.get_logger(__name__)


async def run_academic_agent(
    user_query: str,
    student_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Academic Agent: Specializes in module performance, GPA calculation, syllabus analysis,
    credit progression, and personalized study strategies.
    """
    student_name = student_context.get("name", "Student")
    gpa = student_context.get("gpa", 3.8)
    degree = student_context.get("degree", "BSc Computer Science")
    modules = student_context.get("modules", [])

    modules_summary = "\n".join([
        f"- {m.get('code')}: {m.get('name')} | Mark: {m.get('final_mark') or m.get('target_mark')}% | Status: {m.get('status')} | Credits: {m.get('credits')}"
        for m in modules
    ]) or "No modules currently enrolled."

    prompt = f"""You are the UNiAGENT Academic Agent. Your mission is to provide rigorous, actionable, and encouraging academic guidance to university students.

Student Profile:
Name: {student_name}
Degree: {degree}
Current GPA: {gpa}
Target GPA: {student_context.get('target_gpa', 4.0)}
Credits Earned: {student_context.get('credits_earned', 240)} / {student_context.get('credits_required', 360)}

Current Academic Record & Modules:
{modules_summary}

Student Question:
"{user_query}"

Instructions:
1. Provide concrete academic calculation, analysis, and recommendations based on their enrolled modules and GPA.
2. If discussing study plans or grades, be specific and mathematically accurate.
3. Structure your response with clean Markdown, clear headings, bullet points, and actionable next steps.
"""

    if settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("YOUR_"):
        try:
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are UNiAGENT Academic Agent. Deliver helpful, accurate academic advising."},
                    {"role": "user", "content": prompt}
                ],
                temperature=settings.LLM_TEMPERATURE
            )
            return {
                "agent": "academic",
                "content": resp.choices[0].message.content,
                "sources": [{"type": "academic_record", "title": f"{degree} Transcripts & Modules"}]
            }
        except Exception as e:
            logger.warning("Academic agent OpenAI API error, using structured response", error=str(e))

    # Deterministic fallback response
    content = f"""### Academic Assessment & Guidance

Hello **{student_name}**, here is your academic breakdown:

- **Current GPA**: `{gpa:.2f}` (Target: `{student_context.get('target_gpa', 4.0):.2f}`)
- **Degree Progress**: `{student_context.get('credits_earned', 240)} / {student_context.get('credits_required', 360)} credits completed`
- **Module Health**: You are currently tracking strong results across your computer science curriculum.

#### Key Recommendations for Your Inquiry:
1. **Target Distinction Strategy**: Focus dedicated study blocks on high-weight assessments (>30% weight) in your core modules.
2. **GPA Optimization**: To reach your target GPA of `{student_context.get('target_gpa', 4.0):.2f}`, aim for a minimum of 80% across all remaining credits.
3. **Active Recall & Spaced Repetition**: Implement weekly problem-set reviews 48 hours after lectures to retain algorithmic concepts.
"""
    return {
        "agent": "academic",
        "content": content,
        "sources": [{"type": "academic_record", "title": f"{degree} Transcripts & Modules"}]
    }
