import structlog
from typing import Dict, Any
from openai import AsyncOpenAI
from app.config import settings

logger = structlog.get_logger(__name__)


async def run_support_agent(
    user_query: str,
    student_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Student Support Agent: Provides university information, wellbeing guidance,
    study habits, administrative deadlines, and student life balance.
    """
    student_name = student_context.get("name", "Student")
    university = student_context.get("university", "University")

    prompt = f"""You are the UNiAGENT Student Support & Wellbeing Agent at {university}.

Student: {student_name}
Question:
"{user_query}"

Instructions:
1. Deliver empathetic, practical, and constructive advice for university life, time management, exam anxiety, and university procedures.
2. Emphasize sustainable study routines (e.g. Pomodoro technique, spaced repetition) and campus support resources.
"""

    if settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("YOUR_"):
        try:
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are UNiAGENT Student Support Agent. Provide encouraging and practical university guidance."},
                    {"role": "user", "content": prompt}
                ],
                temperature=settings.LLM_TEMPERATURE
            )
            return {
                "agent": "support",
                "content": resp.choices[0].message.content,
                "sources": [{"type": "support_guide", "title": "University Student Success & Wellbeing Handbook"}]
            }
        except Exception as e:
            logger.warning("Support agent OpenAI error, using fallback", error=str(e))

    content = f"""### University Support & Productivity Advice

Hello **{student_name}**, here are recommended strategies for balanced student success:

1. **Time-Blocking Strategy**: Allocate 90-minute deep work blocks for difficult programming or math modules, followed by 15-minute screen-free breaks.
2. **Prioritization Framework**: Group your tasks into Urgent vs Important (Eisenhower Matrix) to avoid last-minute assignment crunches.
3. **Campus Resources**: If you need special accommodations or tutoring, visit your faculty's academic development center or student support desk.
"""
    return {
        "agent": "support",
        "content": content,
        "sources": [{"type": "support_guide", "title": "University Student Success & Wellbeing Handbook"}]
    }
