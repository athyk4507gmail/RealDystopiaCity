"""
Civic Agent tests — real tools against seeded DB, scripted LLM for deterministic loops.
Run: cd backend && .venv\\Scripts\\python -m pytest tests/test_agent.py -v
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import settings
settings.database_url = "sqlite:///./test_dystopiacty.db"

from app.database import Base, SessionLocal, engine
from app.models import Ward, WaterComplaint
from app.seed.data import seed_database
from app.services import agent_tools, agent_loop
from app.services.agent_tools import (
    execute_tool,
    rebuild_civic_knowledge_index,
    search_civic_knowledge,
)
from app.services.agent_loop import run_agent


@pytest.fixture(scope="module")
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    seed_database(session)
    rebuild_civic_knowledge_index(session)
    yield session
    session.close()


@pytest.fixture
def ward_name(db):
    ward = db.query(Ward).order_by(Ward.id).first()
    assert ward is not None, "Seed DB must contain wards"
    return ward.name


def _scripted_llm(plan: list[dict]):
    """
    Deterministic LLM stand-in. `plan` is a list of agent JSON dicts returned
    in order. When the conversation already contains TOOL_RESULT lines, the
    final_answer entry may use a callable that receives the full user prompt.
    """
    state = {"i": 0}

    async def llm(system: str, user: str) -> str:
        idx = state["i"]
        if idx >= len(plan):
            return json.dumps(
                {
                    "action": "final_answer",
                    "text": "No further scripted steps.",
                }
            )
        item = plan[idx]
        state["i"] = idx + 1
        if callable(item):
            return json.dumps(item(user))
        return json.dumps(item)

    return llm


@pytest.mark.asyncio
async def test_health_risk_trace_matches_tool_score(db, ward_name, monkeypatch):
    """Trace must call get_ward_health_risk with the ward; answer score matches tool."""

    async def fast_gemma(*args, **kwargs):
        return {
            "explanation": f"{ward_name} risk explained from tool data.",
            "intervention": "Clear drains.",
            "generated_at": "test",
            "gemma_elapsed_ms": 1,
            "prompts_debug": {},
        }

    monkeypatch.setattr(
        "app.services.health_watch.get_gemma_reasoning",
        fast_gemma,
    )

    def final_from_tools(user: str):
        # Pull the last TOOL_RESULT JSON
        marker = "TOOL_RESULT for get_ward_health_risk:"
        assert marker in user
        blob = user.split(marker, 1)[1].strip()
        # until next blank double-newline instruction
        json_part = blob.split("\n\nContinue:", 1)[0].strip()
        result = json.loads(json_part)
        score = result["risk_score"]
        return {
            "action": "final_answer",
            "text": (
                f"The health risk score in {result['ward_name']} is {score}, "
                f"based on get_ward_health_risk."
            ),
        }

    plan = [
        {
            "action": "call_tool",
            "tool": "get_ward_health_risk",
            "params": {"ward_name": ward_name},
            "reasoning": "Need the ward health risk score from Health Watch.",
        },
        final_from_tools,
    ]

    out = await run_agent(
        db,
        f"What's the health risk in {ward_name}?",
        llm=_scripted_llm(plan),
    )

    assert len(out["trace"]) == 1
    step = out["trace"][0]
    assert step["tool"] == "get_ward_health_risk"
    assert step["params"]["ward_name"] == ward_name
    assert step["result"]["ok"] is True
    score = step["result"]["risk_score"]
    assert str(score) in out["answer"]
    assert ward_name in out["answer"]


@pytest.mark.asyncio
async def test_file_complaint_creates_db_record(db, ward_name):
    before = db.query(WaterComplaint).count()

    def final_from_tools(user: str):
        marker = "TOOL_RESULT for file_complaint:"
        blob = user.split(marker, 1)[1].split("\n\nContinue:", 1)[0].strip()
        result = json.loads(blob)
        cid = result["complaint"]["id"]
        return {
            "action": "final_answer",
            "text": f"Filed Complaint #{cid} for a water leak in {ward_name}.",
        }

    plan = [
        {
            "action": "call_tool",
            "tool": "file_complaint",
            "params": {
                "ward_name": ward_name,
                "category": "leakage",
                "description": "Agent test water leak near main road",
            },
            "reasoning": "User asked to file a water leak complaint.",
        },
        final_from_tools,
    ]

    out = await run_agent(
        db,
        f"File a complaint about a water leak in {ward_name}",
        llm=_scripted_llm(plan),
    )

    assert out["trace"][0]["tool"] == "file_complaint"
    assert out["trace"][0]["result"]["ok"] is True
    complaint = out["trace"][0]["result"]["complaint"]
    cid = complaint["id"]

    after = db.query(WaterComplaint).count()
    assert after == before + 1
    row = db.query(WaterComplaint).filter(WaterComplaint.id == cid).first()
    assert row is not None
    assert row.type == "leakage"
    assert "Agent test water leak" in row.description


@pytest.mark.asyncio
async def test_fake_ward_does_not_invent_data(db):
    fake = "NonexistentWardvilleXYZ"

    plan = [
        {
            "action": "call_tool",
            "tool": "get_ward_health_risk",
            "params": {"ward_name": fake},
            "reasoning": "Lookup requested ward.",
        },
        lambda user: {
            "action": "final_answer",
            "text": (
                f"I can't find a ward named '{fake}' in the database, "
                "so I will not invent any health risk numbers."
            ),
        },
    ]

    out = await run_agent(
        db,
        f"What's the health risk in {fake}?",
        llm=_scripted_llm(plan),
    )

    assert out["trace"][0]["result"]["ok"] is False
    assert out["trace"][0]["result"]["error"] == "ward_not_found"
    assert "can't find" in out["answer"].lower() or "not find" in out["answer"].lower()
    # Must not invent a numeric risk score claim for the fake ward
    assert "risk score" not in out["answer"].lower() or "invent" in out["answer"].lower()


@pytest.mark.asyncio
async def test_multi_tool_walk_safety_query(db, ward_name, monkeypatch):
    async def fast_gemma(*args, **kwargs):
        return {
            "explanation": "ok",
            "intervention": "ok",
            "generated_at": "test",
            "gemma_elapsed_ms": 1,
            "prompts_debug": {},
        }

    monkeypatch.setattr("app.services.health_watch.get_gemma_reasoning", fast_gemma)

    plan = [
        {
            "action": "call_tool",
            "tool": "get_ward_health_risk",
            "params": {"ward_name": ward_name},
            "reasoning": "Need health risk for walk safety.",
        },
        {
            "action": "call_tool",
            "tool": "get_traffic_status",
            "params": {"area": ward_name},
            "reasoning": "Need traffic status for the same area.",
        },
        lambda user: {
            "action": "final_answer",
            "text": (
                f"For a walk in {ward_name}: health tool and traffic tool both returned real data. "
                "Use those tool results only."
            ),
        },
    ]

    out = await run_agent(
        db,
        f"is it safe to go for a walk in {ward_name} right now, and how's traffic there",
        llm=_scripted_llm(plan),
    )

    tools = [s["tool"] for s in out["trace"]]
    assert len(set(tools)) >= 2
    assert "get_ward_health_risk" in tools
    assert "get_traffic_status" in tools
    assert all(s["result"] is not None for s in out["trace"])
    # Both tool names / ward should appear in the answer narrative
    assert ward_name in out["answer"]
    assert "health" in out["answer"].lower()
    assert "traffic" in out["answer"].lower()


@pytest.mark.asyncio
async def test_rag_retrieves_2022_flood_chunk(db):
    result = search_civic_knowledge(db, "August 2022 Bengaluru flood TK Halli pumping station")
    assert result["ok"] is True
    sources = [m["source"] for m in result["matches"]]
    assert any("Aug 2022 flood" in s for s in sources)
    top = result["matches"][0]
    assert "TK Halli" in top["text"] or "flood" in top["text"].lower()

    plan = [
        {
            "action": "call_tool",
            "tool": "search_civic_knowledge",
            "params": {"query": "August 2022 flood TK Halli water pumping station"},
            "reasoning": "Need historical flood facts from civic knowledge.",
        },
        lambda user: {
            "action": "final_answer",
            "text": (
                "Based on Metabolism historical record: Aug 2022 flood, continuous torrential "
                "rains submerged the TK Halli water pumping station and suspended clean water "
                "supply across central Bengaluru."
            ),
        },
    ]

    out = await run_agent(
        db,
        "What happened to the TK Halli pumping station in the 2022 flood?",
        llm=_scripted_llm(plan),
    )
    assert out["trace"][0]["tool"] == "search_civic_knowledge"
    matches = out["trace"][0]["result"]["matches"]
    assert any("Aug 2022 flood" in m["source"] for m in matches)
    assert "Metabolism historical record: Aug 2022 flood" in out["answer"]
    assert "TK Halli" in out["answer"]


@pytest.mark.asyncio
async def test_rag_retrieves_specific_complaint(db, ward_name):
    import uuid
    unique_marker = str(uuid.uuid4())[:8]
    description = f"Unique indigo dye contamination near civic agent fountain {unique_marker}"
    # Ensure a distinctive complaint exists
    created = await execute_tool(
        db,
        "file_complaint",
        {
            "ward_name": ward_name,
            "category": "contamination",
            "description": description,
        },
    )
    assert created["ok"] is True
    cid = created["complaint"]["id"]
    source_label = f"Complaint #{cid}"

    from app.services.agent_tools import rebuild_civic_knowledge_index
    rebuild_civic_knowledge_index(db)

    result = search_civic_knowledge(db, description)
    assert result["ok"] is True
    assert any(m["source"] == source_label for m in result["matches"])

    plan = [
        {
            "action": "call_tool",
            "tool": "search_civic_knowledge",
            "params": {"query": description},
            "reasoning": "Find the specific complaint record.",
        },
        lambda user: {
            "action": "final_answer",
            "text": (
                f"Based on {source_label} in {ward_name}, there is a reported "
                "indigo dye contamination near civic agent fountain."
            ),
        },
    ]

    out = await run_agent(
        db,
        "Tell me about the indigo dye contamination complaint",
        llm=_scripted_llm(plan),
    )
    assert out["trace"][0]["tool"] == "search_civic_knowledge"
    assert any(m["source"] == source_label for m in out["trace"][0]["result"]["matches"])
    assert source_label in out["answer"]


def test_rag_embedding_method_is_tfidf():
    """Document which embedding backend we use."""
    # Rebuild will set the method; function return includes it.
    session = SessionLocal()
    try:
        meta = rebuild_civic_knowledge_index(session)
        assert meta["embedding_method"] == "tfidf_sklearn"
        assert "sentence-transformers" in meta["reason"].lower() or "scikit-learn" in meta["reason"].lower()
    finally:
        session.close()


def test_resolve_ward_rejects_unknown(db):
    assert agent_tools.resolve_ward(db, "TotallyFakeWard99") is None
