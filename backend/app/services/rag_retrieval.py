"""RAG retrieval for water complaint triage — plain SQL over resolved history."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import WaterComplaint


def _duration_hours(complaint: WaterComplaint) -> float | None:
    if not complaint.resolved_at or not complaint.created_at:
        return None
    delta = complaint.resolved_at - complaint.created_at
    return round(delta.total_seconds() / 3600, 1)


def _to_dict(complaint: WaterComplaint, scope: str) -> dict:
    return {
        "description": complaint.description,
        "resolution_comment": complaint.resolution_comment or "",
        "duration_hours": _duration_hours(complaint),
        "assigned_team": complaint.assigned_team or "Unassigned",
        "scope": scope,
    }


def get_similar_resolved_complaints(
    db: Session,
    ward_id: int,
    issue_type: str,
    limit: int = 6,
) -> list[dict]:
    """
    Retrieve the most recent resolved complaints of the same type in the
    same ward. This IS the retrieval step of RAG — a plain SQL query,
    intentionally simple. The intelligence happens in what Gemma does
    with these real records, not in how they're fetched.
    """
    same_ward = (
        db.query(WaterComplaint)
        .filter(
            WaterComplaint.ward_id == ward_id,
            WaterComplaint.type == issue_type,
            WaterComplaint.status == "resolved",
        )
        .order_by(WaterComplaint.created_at.desc())
        .limit(limit)
        .all()
    )
    results = [_to_dict(c, "same_ward") for c in same_ward]

    if len(results) >= 2:
        return results

    remaining = limit - len(results)
    citywide = (
        db.query(WaterComplaint)
        .filter(
            WaterComplaint.type == issue_type,
            WaterComplaint.status == "resolved",
            WaterComplaint.ward_id != ward_id,
        )
        .order_by(WaterComplaint.created_at.desc())
        .limit(remaining)
        .all()
    )
    results.extend(_to_dict(c, "citywide") for c in citywide)
    return results
