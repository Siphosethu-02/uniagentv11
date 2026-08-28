import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_agent_registry_list(client: AsyncClient):
    response = await client.get("/api/v1/agents/list")
    assert response.status_code == 200
    agents = response.json()
    assert len(agents) >= 6
    agent_ids = [a["id"] for a in agents]
    assert "orchestrator" in agent_ids
    assert "academic" in agent_ids
    assert "project" in agent_ids
    assert "career" in agent_ids
    assert "document" in agent_ids
    assert "support" in agent_ids
    assert "report" in agent_ids
