"""
test_agent_consistency.py
--------------------------
Regression tests ensuring every Civic Agent tool returns data consistent
with the underlying service it wraps.

These tests call:
  1. The agent tool function directly (agent_tools.X)
  2. The service function it delegates to (health_watch.X, traffic.X, etc.)

...with the same inputs, and assert that key numeric fields match exactly.

Why this matters:
  The bug class being guarded against is "agent tool claims success but reads
  from / writes to a different code path than the direct UI action."  These
  tests make that divergence an automated, repeatable failure rather than a
  manual side-by-side check.

No LLM calls are made here. Gemma-dependent paths (run_metabolism_stress_test,
check_risk_zone explain step) are tested for structural correctness only —
the numeric fields that come from the DB are verified; the narrative text
fields that come from Gemma are not asserted on.

Run:
    cd backend
    .venv\\Scripts\\python -m pytest tests/test_agent_consistency.py -v
"""

from __future__ import annotations

import asyncio
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models import Ward
from app.services import agent_tools, health_watch, risk_zones, traffic, traffic_mood


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run(coro):
    """Run a coroutine synchronously — creates a fresh event loop each call
    so tests work under Python 3.10+ where get_event_loop() no longer auto-creates one."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()


def first_ward_named(db, name: str) -> Ward:
    w = db.query(Ward).filter(Ward.name.ilike(name)).first()
    assert w is not None, f"Ward '{name}' not found in DB — seed data may be missing"
    return w


# ---------------------------------------------------------------------------
# 1. Health Watch consistency
# ---------------------------------------------------------------------------

class TestHealthWatchConsistency:
    """
    get_ward_health_risk (agent tool) must return the same numeric values as
    health_watch.compute_ward_health (direct service), because the tool is a
    thin wrapper around the same function.
    """

    def test_risk_score_matches_direct_service(self, db):
        ward = first_ward_named(db, "Koramangala")
        met_state = run(health_watch.get_metabolism_stress())

        direct = run(health_watch.compute_ward_health(ward, met_state))
        tool   = run(agent_tools.get_ward_health_risk(db, "Koramangala"))

        assert tool["ok"] is True, f"Tool returned error: {tool}"
        assert tool["risk_score"] == direct["risk_score"], (
            f"risk_score mismatch: tool={tool['risk_score']} direct={direct['risk_score']}"
        )

    def test_trend_matches_direct_service(self, db):
        ward = first_ward_named(db, "Koramangala")
        met_state = run(health_watch.get_metabolism_stress())

        direct = run(health_watch.compute_ward_health(ward, met_state))
        tool   = run(agent_tools.get_ward_health_risk(db, "Koramangala"))

        assert tool["trend"] == direct["trend"], (
            f"trend mismatch: tool={tool['trend']} direct={direct['trend']}"
        )

    def test_stagnant_reports_match(self, db):
        ward = first_ward_named(db, "Koramangala")
        met_state = run(health_watch.get_metabolism_stress())

        direct = run(health_watch.compute_ward_health(ward, met_state))
        tool   = run(agent_tools.get_ward_health_risk(db, "Koramangala"))

        direct_stagnant = direct["features"]["stagnant_reports_7d"]
        tool_stagnant   = (tool.get("features") or {}).get("stagnant_reports_7d")
        assert tool_stagnant == direct_stagnant, (
            f"stagnant_reports_7d mismatch: tool={tool_stagnant} direct={direct_stagnant}"
        )

    def test_ward_not_found_returns_ok_false(self, db):
        result = run(agent_tools.get_ward_health_risk(db, "NonExistentWardXYZ"))
        assert result["ok"] is False
        assert result["error"] == "ward_not_found"

    def test_tool_exposes_features_and_scoring(self, db):
        """Regression: tool must expose 'features' and 'scoring' dicts so the agent
        can cite specific numbers rather than just a bare risk score."""
        tool = run(agent_tools.get_ward_health_risk(db, "Bellandur"))
        assert tool.get("features") is not None, "tool missing 'features' dict"
        assert tool.get("scoring") is not None, "tool missing 'scoring' dict"
        assert "stagnant_reports_7d" in tool["features"]
        assert "formula" in tool["scoring"]

    def test_two_different_wards_return_different_scores(self, db):
        """Regression for the stale-cache / shared-variable class of bug:
        two different wards must return different data objects."""
        tool_kora    = run(agent_tools.get_ward_health_risk(db, "Koramangala"))
        tool_bella   = run(agent_tools.get_ward_health_risk(db, "Bellandur"))
        assert tool_kora["ward_id"] != tool_bella["ward_id"], (
            "Two different wards returned the same ward_id — possible cache key collision"
        )
        # Risk scores may legitimately be equal, but ward IDs must differ
        assert tool_kora["ward_name"] != tool_bella["ward_name"]


# ---------------------------------------------------------------------------
# 2. Traffic consistency
# ---------------------------------------------------------------------------

class TestTrafficConsistency:
    """
    get_traffic_status (agent tool) must surface the same signals and congestion
    values as traffic.get_traffic_feed (direct service) for the same area.
    """

    def test_signal_congestion_matches_direct_feed(self, db):
        area = "Trinity Circle"
        direct_feed     = traffic.get_traffic_feed(db)
        direct_matches  = [s for s in direct_feed if area.lower() in (s.get("name") or "").lower()]
        tool_result     = run(agent_tools.get_traffic_status(db, area))

        assert tool_result["ok"] is True, f"Tool error: {tool_result}"
        tool_signals = tool_result.get("signals") or []

        assert len(tool_signals) == len(direct_matches), (
            f"Signal count mismatch for '{area}': tool={len(tool_signals)} direct={len(direct_matches)}"
        )

        if direct_matches and tool_signals:
            direct_cong = round(float(direct_matches[0].get("congestion_pct", 0)), 2)
            tool_cong   = round(float(tool_signals[0].get("congestion_pct", 0)), 2)
            assert direct_cong == tool_cong, (
                f"congestion_pct mismatch for '{area}': tool={tool_cong} direct={direct_cong}"
            )

    def test_empty_area_returns_ok_false(self, db):
        result = run(agent_tools.get_traffic_status(db, ""))
        assert result["ok"] is False
        assert result["error"] == "empty_area"

    def test_unknown_area_returns_area_not_found_or_ward_context(self, db):
        result = run(agent_tools.get_traffic_status(db, "ZZZNoSuchRoad999"))
        # Either not found or falls back to ward_context (if name partially matches a ward)
        assert result.get("ok") is False or result.get("match_mode") == "ward_context"


# ---------------------------------------------------------------------------
# 3. Risk Zones consistency
# ---------------------------------------------------------------------------

class TestRiskZoneConsistency:
    """
    check_risk_zone (agent tool) must surface the same segment risk scores as
    risk_zones.get_risk_segments (direct service) for the same area name.
    """

    def test_segment_count_matches_direct_service(self, db):
        area = "MG Road"
        direct_segs   = risk_zones.get_risk_segments(db)
        direct_match  = [s for s in direct_segs if area.lower() in (s.get("name") or "").lower()]
        tool_result   = run(agent_tools.check_risk_zone(db, area))

        assert tool_result["ok"] is True, f"Tool error: {tool_result}"
        tool_segs = tool_result.get("segments") or []

        assert len(tool_segs) == len(direct_match), (
            f"Segment count mismatch for '{area}': tool={len(tool_segs)} direct={len(direct_match)}"
        )

    def test_top_risk_score_matches_direct_service(self, db):
        area = "MG Road"
        direct_segs  = risk_zones.get_risk_segments(db)
        direct_match = [s for s in direct_segs if area.lower() in (s.get("name") or "").lower()]
        tool_result  = run(agent_tools.check_risk_zone(db, area))

        if direct_match and tool_result.get("segments"):
            direct_top = max(direct_match, key=lambda s: s.get("risk_score") or 0)
            tool_top   = max(tool_result["segments"], key=lambda s: s.get("risk_score") or 0)
            assert direct_top["risk_score"] == tool_top["risk_score"], (
                f"Top risk_score mismatch for '{area}': "
                f"tool={tool_top['risk_score']} direct={direct_top['risk_score']}"
            )

    def test_empty_area_returns_ok_false(self, db):
        result = run(agent_tools.check_risk_zone(db, ""))
        assert result["ok"] is False
        assert result["error"] == "empty_area"


# ---------------------------------------------------------------------------
# 4. file_complaint — data path consistency
# ---------------------------------------------------------------------------

class TestComplaintDataPath:
    """
    Regression for Bug 2: file_complaint (agent tool) must write to the same
    WaterComplaint table that get_complaints / the municipality endpoint reads from.
    """

    def test_filed_complaint_appears_in_get_complaints(self, db):
        from app.services import water as water_svc

        # Count before
        before = water_svc.get_complaints(db, ward_id=1)
        count_before = len(before)

        # File via agent tool
        result = run(agent_tools.file_complaint(
            db,
            ward_name="Shivaji Nagar",
            category="leakage",
            description="Test complaint filed by agent consistency test",
        ))
        assert result["ok"] is True, f"file_complaint failed: {result}"
        new_id = (result.get("complaint") or {}).get("id")
        assert new_id is not None, "filed complaint has no id"

        # The same record must appear in get_complaints (the municipality endpoint's query)
        after = water_svc.get_complaints(db, ward_id=1)
        count_after = len(after)
        assert count_after == count_before + 1, (
            f"Complaint count did not increase: before={count_before} after={count_after}"
        )

        # The specific complaint must be findable by id
        ids_after = [(c.get("id") if isinstance(c, dict) else getattr(c, "id", None)) for c in after]
        assert new_id in ids_after, (
            f"New complaint id={new_id} not found in get_complaints result. "
            f"IDs present: {ids_after[:10]}"
        )

    def test_complaint_has_correct_ward_id(self, db):
        result = run(agent_tools.file_complaint(
            db,
            ward_name="Koramangala",
            category="no-supply",
            description="Agent consistency test — ward_id check",
        ))
        assert result["ok"] is True
        complaint = result.get("complaint") or {}
        assert complaint.get("ward_id") == 2, (
            f"Expected ward_id=2 (Koramangala), got {complaint.get('ward_id')}"
        )

    def test_invalid_category_returns_ok_false(self, db):
        result = run(agent_tools.file_complaint(
            db, "Koramangala", "invalid-xyz", "desc"
        ))
        assert result["ok"] is False
        assert result["error"] == "invalid_category"

    def test_unknown_ward_returns_ok_false(self, db):
        result = run(agent_tools.file_complaint(
            db, "NoSuchWardXYZ", "leakage", "desc"
        ))
        assert result["ok"] is False
        assert result["error"] == "ward_not_found"


# ---------------------------------------------------------------------------
# 5. Role-gating consistency (agent_loop variable-shadowing regression)
# ---------------------------------------------------------------------------

class TestRoleGating:
    """
    Regression for Bug 1 (variable shadowing): after the fix, the `role`
    parameter must not be overwritten by the history iteration loop.
    This is tested by inspecting the source of run_agent for the corrected
    variable name.
    """

    def test_history_loop_uses_msg_role_not_role(self):
        """Regression: agent_loop.py must use `msg_role` (not bare `role`) as the
        iteration variable in the history loop so the department role parameter
        is not shadowed."""
        import inspect
        from app.services import agent_loop
        source = inspect.getsource(agent_loop.run_agent)

        # Locate the history loop block — between "for h in history" and "messages.append"
        assert "for h in history" in source, "Could not find history loop in run_agent source"
        loop_block = source.split("for h in history")[1].split("messages.append")[0]

        # The fixed variable name must be present
        assert "msg_role = h.get" in loop_block, (
            "Expected `msg_role = h.get(...)` inside the history loop — "
            "the variable shadowing fix may not be in place."
        )
        # The exact bad pattern must NOT be present: a line that starts with
        # `role = h.get` (bare `role`, not `msg_role`)
        bad_lines = [
            line.strip() for line in loop_block.splitlines()
            if line.strip().startswith("role = h.get")
        ]
        assert not bad_lines, (
            f"Found bare `role = h.get(...)` in the history loop — "
            f"variable shadowing bug is back. Bad lines: {bad_lines}"
        )
