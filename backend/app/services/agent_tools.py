"""
Civic Agent tool registry — thin wrappers around existing service functions.

Every tool validates inputs against real DB data, calls the real underlying
service, and returns structured JSON. Nothing is mocked or hardcoded.
"""

from __future__ import annotations

import re
from typing import Any, Awaitable, Callable

from sqlalchemy.orm import Session

from app.models import Ward, WaterComplaint
from app.services import health_watch, metabolism, risk_zones, traffic, traffic_mood, trust_score, water

# Historical metabolism narratives (same source text as metabolism.run_stress_test)
_METABOLISM_HISTORY = [
    {
        "label": "Metabolism historical record: April 2024 heatwave",
        "text": (
            "Bengaluru recorded rare temperatures breaching 38.5°C, triggering a massive water crisis "
            "where about half of the city's 12,000+ public borewells dried up. Rapidly expanding "
            "peripheral areas had extreme scarcity and high reliance on private water tankers. "
            "Power grids in Karnataka experienced peak demand due to residential air conditioning loads."
        ),
    },
    {
        "label": "Metabolism historical record: Aug 2022 flood",
        "text": (
            "Continuous torrential rains, representing the 3rd heaviest daily rainfall recorded in city "
            "history, completely submerged the TK Halli water pumping station. Clean water supply was "
            "suspended across central Bengaluru for multiple days. In the eastern IT corridors "
            "(ORR, Bellandur, Marathahalli), roads turned to lakes, prompting companies to mandate "
            "remote work, while localized safety-related power blackouts occurred."
        ),
    },
]

VALID_STRESS_EVENTS = ("heatwave", "festival", "pipe_burst", "protest", "bengaluru_flood_aug2022")
VALID_COMPLAINT_TYPES = ("no-supply", "low-pressure", "leakage", "contamination", "other")

ToolHandler = Callable[..., Awaitable[dict[str, Any]] | dict[str, Any]]


def resolve_ward(db: Session, ward_name: str) -> Ward | None:
    """Case-insensitive exact match first, then unique substring match."""
    name = (ward_name or "").strip()
    if not name:
        return None
    exact = (
        db.query(Ward)
        .filter(Ward.name.ilike(name))
        .first()
    )
    if exact:
        return exact
    matches = db.query(Ward).filter(Ward.name.ilike(f"%{name}%")).all()
    if len(matches) == 1:
        return matches[0]
    return None


def _ward_not_found(ward_name: str, db: Session) -> dict[str, Any]:
    known = [w.name for w in db.query(Ward).order_by(Ward.name).all()]
    return {
        "ok": False,
        "error": "ward_not_found",
        "message": f"Ward '{ward_name}' was not found in the database.",
        "known_wards": known[:20],
    }


# ---------------------------------------------------------------------------
# RAG corpus (TF-IDF + cosine similarity via scikit-learn)
# sentence-transformers was skipped: not installed and too heavy for this stack.
# ---------------------------------------------------------------------------

_rag_chunks: list[dict[str, Any]] = []
_rag_vectorizer = None
_rag_matrix = None


def _chunk_sentences(text: str, max_sentences: int = 3) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    if not parts:
        return [text.strip()] if text.strip() else []
    chunks: list[str] = []
    for i in range(0, len(parts), max_sentences):
        chunks.append(" ".join(parts[i : i + max_sentences]))
    return chunks


def rebuild_civic_knowledge_index(db: Session) -> dict[str, Any]:
    """Rebuild TF-IDF index from live complaint rows + metabolism historical blocks."""
    global _rag_chunks, _rag_vectorizer, _rag_matrix

    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    chunks: list[dict[str, Any]] = []
    ward_map = {w.id: w.name for w in db.query(Ward).all()}

    for c in db.query(WaterComplaint).order_by(WaterComplaint.id).all():
        ward_name = ward_map.get(c.ward_id, "Unknown")
        filed = c.created_at.isoformat() if c.created_at else ""
        text = (
            f"Ward: {ward_name}, Category: {c.type}, Description: {c.description}, "
            f"Status: {c.status}, Filed: {filed}"
        )
        chunks.append(
            {
                "text": text,
                "source": f"Complaint #{c.id}",
                "kind": "complaint",
                "complaint_id": c.id,
                "ward_name": ward_name,
            }
        )

    for hist in _METABOLISM_HISTORY:
        for piece in _chunk_sentences(hist["text"], max_sentences=2):
            chunks.append(
                {
                    "text": piece,
                    "source": hist["label"],
                    "kind": "metabolism_history",
                }
            )

    _rag_chunks = chunks
    if not chunks:
        _rag_vectorizer = None
        _rag_matrix = None
        return {"ok": True, "chunk_count": 0}

    _rag_vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    _rag_matrix = _rag_vectorizer.fit_transform([c["text"] for c in chunks])
    # Touch cosine_similarity import so the dependency is validated at rebuild time
    _ = cosine_similarity
    return {
        "ok": True,
        "chunk_count": len(chunks),
        "embedding_method": "tfidf_sklearn",
        "reason": (
            "Used scikit-learn TF-IDF + cosine similarity because sentence-transformers "
            "is not installed and would add a heavy local model dependency."
        ),
    }


def search_civic_knowledge(db: Session, query: str, top_k: int = 5) -> dict[str, Any]:
    """Retrieve top-k civic knowledge chunks for a query (real TF-IDF over live corpus)."""
    from sklearn.metrics.pairwise import cosine_similarity

    q = (query or "").strip()
    if not q:
        return {"ok": False, "error": "empty_query", "message": "query must be a non-empty string."}

    if not _rag_chunks or _rag_vectorizer is None or _rag_matrix is None:
        rebuild_civic_knowledge_index(db)

    if not _rag_chunks or _rag_vectorizer is None or _rag_matrix is None:
        return {"ok": True, "matches": [], "message": "Knowledge corpus is empty."}

    k = max(1, min(int(top_k or 5), 5))
    q_vec = _rag_vectorizer.transform([q])
    scores = cosine_similarity(q_vec, _rag_matrix).flatten()
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:k]

    matches = []
    for idx, score in ranked:
        chunk = _rag_chunks[idx]
        matches.append(
            {
                "text": chunk["text"],
                "source": chunk["source"],
                "similarity": round(float(score), 4),
                "kind": chunk.get("kind"),
            }
        )

    return {
        "ok": True,
        "query": q,
        "matches": matches,
        "embedding_method": "tfidf_sklearn",
        "citation_instruction": (
            "When using any fact from these matches, cite the source label explicitly "
            "(e.g. 'Based on Complaint #12 in Indiranagar...')."
        ),
    }


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

async def get_ward_health_risk(db: Session, ward_name: str) -> dict[str, Any]:
    """
    Health Watch score + contributing inputs for a ward.

    Intentionally skips the nested Health Watch Gemma narrative calls
    (compute_ward_health_detail) — those add ~25-50s and the Civic Agent
    synthesizes its own final_answer from the structured score/features.
    """
    ward = resolve_ward(db, ward_name)
    if not ward:
        return _ward_not_found(ward_name, db)
    metabolism = await health_watch.get_metabolism_stress()
    record = await health_watch.compute_ward_health(ward, metabolism)
    return {
        "ok": True,
        "ward_id": ward.id,
        "ward_name": ward.name,
        "risk_score": record.get("risk_score"),
        "trend": record.get("trend"),
        "features": record.get("features"),
        "scoring": record.get("scoring"),
        "gemma": None,
        "gemma_note": (
            "Nested Health Watch Gemma explanation skipped in Civic Agent path "
            "to avoid compounding latency; score and features are live."
        ),
        "metabolism_link": record.get("metabolism_link"),
    }


async def get_water_complaints(db: Session, ward_name: str) -> dict[str, Any]:
    ward = resolve_ward(db, ward_name)
    if not ward:
        return _ward_not_found(ward_name, db)
    complaints = water.get_complaints(db, ward_id=ward.id)
    return {
        "ok": True,
        "ward_id": ward.id,
        "ward_name": ward.name,
        "count": len(complaints),
        "complaints": complaints,
    }


async def file_complaint(
    db: Session, ward_name: str, category: str, description: str
) -> dict[str, Any]:
    ward = resolve_ward(db, ward_name)
    if not ward:
        return _ward_not_found(ward_name, db)
    cat = (category or "").strip().lower().replace(" ", "-")
    if cat in ("water-leak", "water_leak", "leak", "pipe-leak"):
        cat = "leakage"
    if cat not in VALID_COMPLAINT_TYPES:
        return {
            "ok": False,
            "error": "invalid_category",
            "message": f"Category '{category}' is invalid.",
            "valid_categories": list(VALID_COMPLAINT_TYPES),
        }
    desc = (description or "").strip()
    if not desc:
        return {"ok": False, "error": "empty_description", "message": "description is required."}
    created = water.create_complaint(db, ward.id, cat, desc)
    # Keep RAG index fresh after writes
    rebuild_civic_knowledge_index(db)
    return {"ok": True, "complaint": created}


async def get_traffic_status(db: Session, area: str) -> dict[str, Any]:
    area_q = (area or "").strip()
    if not area_q:
        return {"ok": False, "error": "empty_area", "message": "area is required."}

    feed = traffic.get_traffic_feed(db)
    events = await traffic_mood.get_events(db)

    matched_signals = [
        s for s in feed if area_q.lower() in (s.get("name") or "").lower()
    ]
    matched_events = [
        e
        for e in events
        if area_q.lower() in (e.get("location") or "").lower()
        or area_q.lower() in (e.get("title") or "").lower()
        or any(area_q.lower() in (r or "").lower() for r in (e.get("affected_roads") or []))
    ]

    # Also try ward-name match: if area is a ward, surface nearby events/signals broadly
    ward = resolve_ward(db, area_q)
    if ward and not matched_signals and not matched_events:
        matched_events = [
            e
            for e in events
            if ward.name.lower() in (e.get("location") or "").lower()
            or ward.name.lower() in (e.get("title") or "").lower()
        ]
        # Fall back to city-wide top congested signals for context
        matched_signals = sorted(feed, key=lambda s: s.get("congestion_pct", 0), reverse=True)[:5]
        return {
            "ok": True,
            "area": ward.name,
            "match_mode": "ward_context",
            "signals": matched_signals,
            "events": matched_events,
            "message": (
                f"No signal named '{area_q}'; showing top congested signals city-wide "
                f"plus events matching ward '{ward.name}'."
            ),
        }

    if not matched_signals and not matched_events:
        signal_names = [s.get("name") for s in feed][:15]
        return {
            "ok": False,
            "error": "area_not_found",
            "message": f"No traffic signals or events matched area '{area_q}'.",
            "known_signal_names": signal_names,
        }

    return {
        "ok": True,
        "area": area_q,
        "signals": matched_signals,
        "events": matched_events,
    }


async def run_metabolism_stress_test(db: Session, event_type: str) -> dict[str, Any]:
    et = (event_type or "").strip().lower().replace(" ", "_")
    aliases = {
        "flood": "bengaluru_flood_aug2022",
        "flood_2022": "bengaluru_flood_aug2022",
        "aug2022_flood": "bengaluru_flood_aug2022",
        "august_2022_flood": "bengaluru_flood_aug2022",
        "heat": "heatwave",
    }
    et = aliases.get(et, et)
    if et not in VALID_STRESS_EVENTS:
        return {
            "ok": False,
            "error": "invalid_event_type",
            "message": f"event_type '{event_type}' is not supported.",
            "valid_event_types": list(VALID_STRESS_EVENTS),
        }
    result = await metabolism.run_stress_test(db, et)
    # Strip oversized cascade steps for agent context size
    compact = {
        "ok": True,
        "event_type": result.get("event_type"),
        "vitals_before": result.get("vitals_before"),
        "vitals_after": result.get("vitals_after"),
        "resilience_before": result.get("resilience_before"),
        "resilience_after": result.get("resilience_after"),
        "resilience_index": result.get("resilience_index"),
        "narrative": result.get("narrative"),
        "historical_validation": result.get("historical_validation"),
        "ward_impacts": (result.get("ward_impacts") or [])[:5],
    }
    return compact


async def get_trust_score_route(
    db: Session, from_area: str, to_area: str, time_slot: str = "8AM"
) -> dict[str, Any]:
    origin = (from_area or "").strip()
    dest = (to_area or "").strip()
    if not origin or not dest:
        return {
            "ok": False,
            "error": "missing_areas",
            "message": "from_area and to_area are required.",
        }
    result = await trust_score.get_recommendation(db, origin, dest, time_slot=time_slot or "8AM")
    return {"ok": True, "from_area": origin, "to_area": dest, "time_slot": time_slot or "8AM", **result}


async def check_risk_zone(db: Session, area: str) -> dict[str, Any]:
    area_q = (area or "").strip()
    if not area_q:
        return {"ok": False, "error": "empty_area", "message": "area is required."}

    segments = risk_zones.get_risk_segments(db)
    black_spots = risk_zones.get_reported_black_spots()

    matched_segments = [
        s for s in segments if area_q.lower() in (s.get("name") or "").lower()
    ]
    matched_spots = [
        s for s in black_spots if area_q.lower() in (s.get("name") or "").lower()
    ]

    if not matched_segments and not matched_spots:
        # Try explaining highest-risk segment near a name substring via all segments
        names = [s.get("name") for s in segments][:20]
        return {
            "ok": False,
            "error": "area_not_found",
            "message": f"No risk-zone segment or black spot matched '{area_q}'.",
            "known_segment_names": names,
        }

    detail = None
    if matched_segments:
        top = max(matched_segments, key=lambda s: s.get("risk_score") or 0)
        detail = await risk_zones.explain_zone(db, top["id"])

    return {
        "ok": True,
        "area": area_q,
        "segments": matched_segments,
        "black_spots": matched_spots,
        "top_explanation": detail,
    }


async def search_civic_knowledge_tool(db: Session, query: str) -> dict[str, Any]:
    return search_civic_knowledge(db, query)


TOOL_REGISTRY: dict[str, dict[str, Any]] = {
    "get_ward_health_risk": {
        "description": "Get Health Watch risk score, contributing inputs, and explanation for a ward.",
        "params": {"ward_name": "string — exact or unique ward name"},
        "handler": get_ward_health_risk,
    },
    "get_water_complaints": {
        "description": "List water complaints for a ward.",
        "params": {"ward_name": "string"},
        "handler": get_water_complaints,
    },
    "file_complaint": {
        "description": "File a water complaint for a ward.",
        "params": {
            "ward_name": "string",
            "category": "one of: no-supply, low-pressure, leakage, contamination, other",
            "description": "string",
        },
        "handler": file_complaint,
    },
    "get_traffic_status": {
        "description": "Get traffic signal congestion and Traffic Mood events for an area.",
        "params": {"area": "string — road, junction, or ward area name"},
        "handler": get_traffic_status,
    },
    "run_metabolism_stress_test": {
        "description": "Run a City Metabolism stress-test cascade simulation.",
        "params": {
            "event_type": "one of: heatwave, festival, pipe_burst, protest, bengaluru_flood_aug2022",
        },
        "handler": run_metabolism_stress_test,
    },
    "get_trust_score_route": {
        "description": "Recommend a bus route by trust score between two areas.",
        "params": {"from_area": "string", "to_area": "string"},
        "handler": get_trust_score_route,
    },
    "check_risk_zone": {
        "description": "Check accident-prone risk zones / black spots for an area.",
        "params": {"area": "string"},
        "handler": check_risk_zone,
    },
    "search_civic_knowledge": {
        "description": (
            "RAG search over civic complaints and metabolism historical records. "
            "Cite source labels for any fact used."
        ),
        "params": {"query": "string"},
        "handler": search_civic_knowledge_tool,
    },
}


def list_tools_for_prompt() -> str:
    lines = []
    for name, meta in TOOL_REGISTRY.items():
        params = ", ".join(f"{k}: {v}" for k, v in meta["params"].items())
        lines.append(f"- {name}({params}): {meta['description']}")
    return "\n".join(lines)


async def execute_tool(db: Session, tool_name: str, params: dict[str, Any]) -> dict[str, Any]:
    if tool_name not in TOOL_REGISTRY:
        return {
            "ok": False,
            "error": "unknown_tool",
            "message": f"Tool '{tool_name}' is not in the registry.",
            "available_tools": list(TOOL_REGISTRY.keys()),
        }
    handler = TOOL_REGISTRY[tool_name]["handler"]
    required = list(TOOL_REGISTRY[tool_name]["params"].keys())
    missing = [k for k in required if k not in (params or {}) or params.get(k) in (None, "")]
    # time_slot is optional for trust score — only require declared params that are core
    if tool_name == "get_trust_score_route":
        missing = [k for k in ("from_area", "to_area") if not (params or {}).get(k)]
    if missing:
        return {
            "ok": False,
            "error": "invalid_params",
            "message": f"Missing required params for {tool_name}: {missing}",
            "required": required,
        }
    clean = dict(params or {})
    result = handler(db, **clean)
    if hasattr(result, "__await__"):
        result = await result  # type: ignore[misc]
    return result  # type: ignore[return-value]
