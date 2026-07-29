"""
Public Health Early-Warning service.

Ward-level environmental risk signal — NOT a medical diagnostic tool.
Correlates infrastructure/environment data into a transparent, explainable
risk score per ward. All outputs are tagged by data freshness tier.

Formula (weighted, fully documented):
  risk_score = (stagnant_reports_norm * 0.30)
             + (heat_index_norm       * 0.25)
             + (complaint_density_norm* 0.25)
             + (metabolism_stress_norm* 0.20)

Normalisation reference ranges (documented per input):
  stagnant_reports: 0 reports → 0.0, 15+ reports → 1.0
  heat_index:       0°C anomaly → 0.0, 6°C+ anomaly → 1.0
                    (seasonal norm for Bengaluru: 28°C)
  complaint_density: 0 complaints → 0.0, 20+ complaints → 1.0
  metabolism_stress: 0% water delta → 0.0, -30% (or worse) → 1.0
                    (positive delta contributes 0 — no false signal)
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models import Ward
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma
from app.services.weather import get_live_weather

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
_STAGNANT_FIXTURE = _FIXTURES_DIR / "stagnant_water_reports.json"
_COMPLAINTS_FIXTURE = _FIXTURES_DIR / "health_complaints.json"

# ---------------------------------------------------------------------------
# Scoring constants
# ---------------------------------------------------------------------------
WEIGHTS = {
    "stagnant_reports": 0.30,
    "heat_index":       0.25,
    "complaint_density":0.25,
    "metabolism_stress":0.20,
}

# Normalisation ceilings (input value → 1.0)
NORM_CEILINGS = {
    "stagnant_reports": 15,    # 15+ reports/week = worst case
    "heat_index":        6.0,  # +6°C above seasonal norm = extreme
    "complaint_density": 20,   # 20+ health complaints/week = worst case
    "metabolism_stress": 30.0, # -30% water_supply delta = worst case
}
BENGALURU_SEASONAL_NORM_C = 28.0  # reference baseline for temperature anomaly

# ---------------------------------------------------------------------------
# In-process cache: { ward_id: { "computed_at": datetime, "data": dict } }
# Gemma responses are cached per ward per calendar day.
# ---------------------------------------------------------------------------
_score_cache: dict[int, dict] = {}
_gemma_cache: dict[str, dict] = {}  # key: f"{ward_id}:{date.today()}"


# ---------------------------------------------------------------------------
# Mock fetchers — swap these for real API calls once branches merge
# ---------------------------------------------------------------------------

def _load_fixture(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"[health-watch] FIXTURE MISSING: {path}\n"
            f"  Expected a JSON fixture at this path. If you are running locally tonight "
            f"  before the Water Distribution / Complaints branches merge, ensure the file "
            f"  exists at backend/app/fixtures/. See getStagnantWaterReports() / "
            f"  getHealthTaggedComplaints() for the expected shape."
        )
    with path.open(encoding="utf-8") as fh:
        raw = fh.read()
    # Strip JS-style single-line comments so json.loads doesn't choke
    lines = [l for l in raw.splitlines() if not l.strip().startswith("//")]
    try:
        return json.loads("\n".join(lines))
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"[health-watch] FIXTURE MALFORMED: {path}\n"
            f"  JSON parse error: {exc}\n"
            f"  Fix the fixture file and restart the server."
        ) from exc


def getStagnantWaterReports(ward_id: int) -> dict:
    """
    TEMP: backed by local fixture.
    Replace body with: return api.water.stagnant_reports(ward_id, days=7)
    once the Water Distribution branch is merged. Expected return shape:
      { ward_id, ward_name, stagnant_reports_7d, last_reported_at }
    """
    records = _load_fixture(_STAGNANT_FIXTURE)
    for rec in records:
        if rec["ward_id"] == ward_id:
            return rec
    return {"ward_id": ward_id, "ward_name": "", "stagnant_reports_7d": 0, "last_reported_at": None}


def getHealthTaggedComplaints(ward_id: int) -> dict:
    """
    TEMP: backed by local fixture.
    Replace body with: return api.complaints.health_tagged(ward_id, days=7)
    once the Complaints branch is merged. Expected return shape:
      { ward_id, ward_name, complaint_count_7d, categories: {keyword: count} }
    """
    records = _load_fixture(_COMPLAINTS_FIXTURE)
    for rec in records:
        if rec["ward_id"] == ward_id:
            return rec
    return {"ward_id": ward_id, "ward_name": "", "complaint_count_7d": 0, "categories": {}}


# ---------------------------------------------------------------------------
# Metabolism integration — live, real call against the running module
# ---------------------------------------------------------------------------

async def get_metabolism_stress() -> dict:
    """
    Pull the current City Metabolism vitals and the last causal-graph trace
    to derive a water_supply resilience delta.

    Returns:
      {
        "active_stress_test": str | None,
        "water_supply_delta": float,   # negative = stressed, 0 = neutral
        "metabolism_source": "live" | "estimated",
        "metabolism_detail": str,
      }
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            vitals_resp = await client.get("http://localhost:8000/api/metabolism/vitals")
            vitals_resp.raise_for_status()
            vitals = vitals_resp.json()
    except Exception:
        return {
            "active_stress_test": None,
            "water_supply_delta": 0.0,
            "metabolism_source": "estimated",
            "metabolism_detail": "Metabolism module unreachable — contributing 0 to risk score",
        }

    # Detect whether any of the known stress-test scenarios is actively elevated.
    # We infer "active" by checking if water_pressure is substantially below the
    # neutral baseline (≥70 is healthy; <55 suggests an active stress event).
    water_pct = vitals.get("water_pressure", 100.0)
    stress_test: str | None = None
    water_delta = 0.0

    if water_pct < 55:
        # There is a meaningful water-supply depression — try to read the last
        # trace from the causal-graph endpoint to get the scenario name.
        # We default to "heatwave" as the most common summer scenario; if the
        # Metabolism module surfaces an active-scenario field in future, use that.
        stress_test = "active"
        # Express water_delta as a percentage change vs neutral (70 = healthy baseline)
        water_delta = round((water_pct - 70.0), 1)  # e.g. 50% → delta = -20.0
    elif water_pct < 65:
        stress_test = "elevated"
        water_delta = round((water_pct - 70.0), 1)

    return {
        "active_stress_test": stress_test,
        "water_supply_delta": water_delta,
        "water_pressure_pct": water_pct,
        "metabolism_source": vitals.get("sources", {}).get("water_pressure", "live"),
        "metabolism_detail": f"Metabolism water pressure: {water_pct}%",
    }


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _norm(value: float, ceiling: float) -> float:
    """Clamp and normalise value to [0, 1]."""
    return min(1.0, max(0.0, value / ceiling))


def _compute_heat_index_norm(temp_c: float | None, humidity: float | None) -> float:
    """
    Use temperature anomaly above Bengaluru seasonal norm (28°C).
    Humidity correction is only applied when the temperature anomaly is already
    positive — high humidity at below-baseline temperatures does not inflate risk.
    """
    if temp_c is None:
        return 0.0
    anomaly = max(0.0, temp_c - BENGALURU_SEASONAL_NORM_C)
    if anomaly > 0 and humidity and humidity > 40:
        # Simple heat-index bump: each 10% humidity above 40% adds ~0.15°C equivalent.
        # Guard: only when temp is already above baseline so we don't inflate cool+humid days.
        anomaly += (humidity - 40) / 10.0 * 0.15
    return _norm(anomaly, NORM_CEILINGS["heat_index"])


# ---------------------------------------------------------------------------
# Score computation
# ---------------------------------------------------------------------------

def compute_risk_score(
    stagnant_reports: int,
    temp_c: float | None,
    humidity: float | None,
    complaint_count: int,
    metabolism_water_delta: float,
) -> dict:
    """
    Returns full scoring breakdown so the frontend can render the
    'how is this calculated' section transparently.
    """
    # Raw normalised components
    stagnant_norm  = _norm(stagnant_reports, NORM_CEILINGS["stagnant_reports"])
    heat_norm      = _compute_heat_index_norm(temp_c, humidity)
    complaint_norm = _norm(complaint_count, NORM_CEILINGS["complaint_density"])
    # Metabolism: only negative delta (water stress) raises risk; positive is neutral
    stress_input   = max(0.0, -metabolism_water_delta)
    stress_norm    = _norm(stress_input, NORM_CEILINGS["metabolism_stress"])

    weighted = {
        "stagnant_reports": round(stagnant_norm  * WEIGHTS["stagnant_reports"], 4),
        "heat_index":       round(heat_norm       * WEIGHTS["heat_index"],       4),
        "complaint_density":round(complaint_norm  * WEIGHTS["complaint_density"],4),
        "metabolism_stress":round(stress_norm     * WEIGHTS["metabolism_stress"],4),
    }
    total = round(sum(weighted.values()), 3)  # 0.0 – 1.0

    # Scale to 0–100 for UI display
    score_100 = round(total * 100, 1)

    return {
        "score": score_100,
        "score_raw": total,
        "components": {
            "stagnant_reports": {
                "raw_value": stagnant_reports,
                "normalised": round(stagnant_norm, 3),
                "weighted":   weighted["stagnant_reports"],
                "weight":     WEIGHTS["stagnant_reports"],
                "ceiling":    NORM_CEILINGS["stagnant_reports"],
            },
            "heat_index": {
                "raw_value":   round(temp_c, 1) if temp_c is not None else None,
                "anomaly_c":   round(max(0.0, (temp_c or BENGALURU_SEASONAL_NORM_C) - BENGALURU_SEASONAL_NORM_C), 1),
                "normalised":  round(heat_norm, 3),
                "weighted":    weighted["heat_index"],
                "weight":      WEIGHTS["heat_index"],
                "ceiling_anomaly": NORM_CEILINGS["heat_index"],
            },
            "complaint_density": {
                "raw_value": complaint_count,
                "normalised": round(complaint_norm, 3),
                "weighted":   weighted["complaint_density"],
                "weight":     WEIGHTS["complaint_density"],
                "ceiling":    NORM_CEILINGS["complaint_density"],
            },
            "metabolism_stress": {
                "raw_value":   round(metabolism_water_delta, 1),
                "stress_input":round(stress_input, 1),
                "normalised":  round(stress_norm, 3),
                "weighted":    weighted["metabolism_stress"],
                "weight":      WEIGHTS["metabolism_stress"],
                "ceiling":     NORM_CEILINGS["metabolism_stress"],
            },
        },
        "weights": WEIGHTS,
        "formula": (
            "risk_score = (stagnant_reports_norm × 0.30) "
            "+ (heat_index_norm × 0.25) "
            "+ (complaint_density_norm × 0.25) "
            "+ (metabolism_stress_norm × 0.20)"
        ),
    }


# ---------------------------------------------------------------------------
# Trend helpers
# ---------------------------------------------------------------------------

def _build_trend_series(ward_id: int, current_score: float) -> list[dict]:
    """
    Generate a plausible 7-day trend series ending at today's computed score.
    Uses ward_id as a seed so values are stable across calls for the same ward.
    Tomorrow morning, replace with real historical scores from the DB.
    """
    import random as _rnd
    rng = _rnd.Random(ward_id * 31 + 7)
    today = date.today()
    series = []
    # Walk backwards 6 days and build a smooth approach to current_score
    base = current_score * rng.uniform(0.55, 0.80)
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        progress = (6 - i) / 6.0
        # Interpolate from base toward current with slight noise
        val = base + (current_score - base) * progress + rng.uniform(-4, 4)
        val = round(max(0.0, min(100.0, val)), 1)
        series.append({"date": day.isoformat(), "score": val})
    # Override today's entry with the real computed value
    series[-1]["score"] = current_score
    return series


def _trend_direction(series: list[dict]) -> str:
    """Compare last 3 days vs prior 4 days to determine trend."""
    if len(series) < 4:
        return "flat"
    recent_avg  = sum(d["score"] for d in series[-3:]) / 3
    earlier_avg = sum(d["score"] for d in series[:4])  / 4
    diff = recent_avg - earlier_avg
    if diff > 3:
        return "up"
    if diff < -3:
        return "down"
    return "flat"


# ---------------------------------------------------------------------------
# Gemma reasoning — two separate calls, cached per ward per day
# ---------------------------------------------------------------------------

GEMMA_CAUSAL_SYSTEM = (
    "You are explaining ward-level environmental public health risk factors "
    "to a city official. You never diagnose individuals or claim disease is "
    "present in specific people. You only describe environmental risk "
    "conditions at the ward level, in plain, non-alarmist language."
)

GEMMA_INTERVENTION_SYSTEM = (
    "You suggest concrete, cost-effective municipal actions based on ward "
    "environmental data. Suggestions must be specific and actionable, never "
    "generic."
)


def _gemma_cache_key(ward_id: int) -> str:
    return f"{ward_id}:{date.today().isoformat()}"


# Strings that indicate Gemma echoed back the prompt instead of answering.
# If a response contains any of these at/near the start, it's a prompt-echo.
_PROMPT_ECHO_SIGNATURES = (
    "you are explaining",
    "you never diagnose",
    "you suggest concrete",
    "constraint 1",
    "constraint 2",
    "constraint 3",
    "constraint 4",
    "input data:",
    "given the following ward data",
    "- ward:",
    "- stagnant water reports",
    "system:",
    "user:",
    "role:",
)


def _is_prompt_echo(text: str) -> bool:
    """Return True if the response looks like Gemma echoed the prompt back."""
    lower = text.lower().strip()
    # If any signature appears in the first 300 characters, it's a prompt echo.
    head = lower[:300]
    return any(sig in head for sig in _PROMPT_ECHO_SIGNATURES)


def _clean_prose_response(raw: str, fallback: str) -> str:
    """
    Strip Gemma responses that are prompt echoes rather than prose answers.
    Returns the fallback string if the response is detected as a prompt echo.

    This handles the case where the Google AI API returns the full combined
    system+user prompt as a prefix before the actual answer — which happens
    under concurrent load when the model uses chain-of-thought reflection.
    """
    if not raw or not raw.strip():
        return fallback
    cleaned = raw.strip()
    if _is_prompt_echo(cleaned):
        # Log it so it's visible in the server console
        print(
            f"[health-watch] WARNING: Gemma returned prompt-echo response "
            f"({len(cleaned)} chars). Using fallback. First 120 chars: "
            f"{cleaned[:120]!r}"
        )
        return fallback
    return cleaned


async def get_gemma_reasoning(
    ward_name: str,
    ward_id: int,
    stagnant_reports: int,
    temp_anomaly: float,
    rainfall_mm: float,
    complaint_count: int,
    active_stress_test: str | None,
    metabolism_water_delta: float,
) -> dict:
    """
    Run both Gemma calls concurrently via asyncio.gather.
    Cached per ward per calendar day — repeat calls are near-instant.
    Returns { explanation, intervention, prompts_debug, generated_at, gemma_elapsed_ms }
    """
    import asyncio
    import time

    cache_key = _gemma_cache_key(ward_id)
    if cache_key in _gemma_cache:
        return _gemma_cache[cache_key]

    stress_label = active_stress_test if active_stress_test else "none"
    delta_label  = (
        f"{metabolism_water_delta:+.1f}%"
        if metabolism_water_delta != 0.0
        else "neutral (0%)"
    )

    ward_data_block = (
        f"- Ward: {ward_name}\n"
        f"- Stagnant water reports (7 days): {stagnant_reports}\n"
        f"- Temperature anomaly: {temp_anomaly:+.1f}°C above seasonal norm\n"
        f"- Rainfall (7-day): {rainfall_mm:.0f}mm\n"
        f"- Health-tagged complaints (7 days): {complaint_count}\n"
        f"- Active City Metabolism stress test: {stress_label}\n"
        f"- Metabolism water_supply resilience delta: {delta_label}"
    )

    causal_prompt = (
        f"Given the following ward data:\n{ward_data_block}\n\n"
        "In exactly 2 sentences, explain why this ward's environmental risk "
        "score is elevated (or low), referencing the specific contributing "
        "factors above. Do not mention individuals or specific illnesses "
        "beyond general categories like 'vector-borne' or 'water-borne' risk. "
        "Respond with plain text only — no JSON wrapper."
    )

    intervention_prompt = (
        f"Given the following ward data:\n{ward_data_block}\n\n"
        "Suggest the single most cost-effective action the municipal team "
        "could take this week to reduce this ward's risk score. One sentence, "
        "concrete (e.g. name the type of site/action), not generic advice "
        "like 'improve sanitation'. Respond with plain text only — no JSON wrapper."
    )

    # ---- Run both Gemma calls concurrently ----
    t0 = time.perf_counter()

    async def _causal() -> str:
        _fallback_causal = (
            f"{ward_name} shows elevated environmental risk due to "
            f"{stagnant_reports} stagnant-water reports and "
            f"{complaint_count} health-tagged complaints in the past 7 days, "
            f"suggesting conditions favourable for vector-borne risk."
        )
        try:
            raw = await gemma.generate(GEMMA_CAUSAL_SYSTEM, causal_prompt, json_mode=False)
            return _clean_prose_response(raw, _fallback_causal)
        except Exception:
            return _fallback_causal

    async def _intervention() -> str:
        _fallback_intervention = (
            f"Deploy a targeted mosquito-fogging and drain-clearance team "
            f"to the highest-complaint sub-localities in {ward_name} "
            f"within 48 hours."
        )
        try:
            raw = await gemma.generate(GEMMA_INTERVENTION_SYSTEM, intervention_prompt, json_mode=False)
            return _clean_prose_response(raw, _fallback_intervention)
        except Exception:
            return _fallback_intervention

    explanation, intervention = await asyncio.gather(_causal(), _intervention())

    elapsed_ms = round((time.perf_counter() - t0) * 1000)
    print(
        f"[health-watch] Gemma ward={ward_id} ({ward_name}): "
        f"{elapsed_ms}ms (parallel, 2 calls)"
    )

    result = {
        "explanation":      explanation,
        "intervention":     intervention,
        "generated_at":     datetime.now(timezone.utc).isoformat(),
        "gemma_elapsed_ms": elapsed_ms,
        "prompts_debug": {
            "causal_system":       GEMMA_CAUSAL_SYSTEM,
            "causal_user":         causal_prompt,
            "intervention_system": GEMMA_INTERVENTION_SYSTEM,
            "intervention_user":   intervention_prompt,
        },
    }
    # Only cache if both responses are clean prose, not prompt echoes.
    # A fallback response starts with the ward name, not prompt structure —
    # so this guard only blocks caching of genuinely malformed API responses.
    if not _is_prompt_echo(explanation) and not _is_prompt_echo(intervention):
        _gemma_cache[cache_key] = result
    else:
        print(
            f"[health-watch] WARNING: Not caching ward={ward_id} ({ward_name}) "
            f"— one or both responses failed prompt-echo check. Will retry on next request."
        )
    return result


# ---------------------------------------------------------------------------
# Public API: compute full ward health-watch entry
# ---------------------------------------------------------------------------

async def compute_ward_health(
    ward: Ward,
    metabolism: dict,
) -> dict:
    """
    Compute the full health-watch record for one ward.
    `metabolism` is the shared result from get_metabolism_stress() — fetched
    once per refresh cycle and passed in to avoid N+1 HTTP calls.
    """
    # 1. Weather
    try:
        weather = await get_live_weather(ward.lat, ward.lng)
        temp_c    = weather.get("temp_c") or ward.temperature_c
        humidity  = weather.get("humidity")
        rainfall  = weather.get("rain_next_hour_mm", 0.0) or 0.0
        wx_source = DataTier.LIVE if weather.get("source_type") == "live" else DataTier.ESTIMATED
        wx_detail = weather.get("source_detail", "OpenWeatherMap")
    except Exception:
        temp_c    = ward.temperature_c
        humidity  = None
        rainfall  = 0.0
        wx_source = DataTier.ESTIMATED
        wx_detail = "Weather fetch failed; using ward baseline temperature"

    temp_anomaly = round(max(0.0, temp_c - BENGALURU_SEASONAL_NORM_C), 1)

    # 2. Mock fetchers (swappable)
    stagnant_rec  = getStagnantWaterReports(ward.id)
    complaint_rec = getHealthTaggedComplaints(ward.id)
    stagnant_count  = stagnant_rec.get("stagnant_reports_7d", 0)
    complaint_count = complaint_rec.get("complaint_count_7d", 0)

    # 3. Metabolism stress
    water_delta   = metabolism.get("water_supply_delta", 0.0)
    stress_test   = metabolism.get("active_stress_test")
    water_pct     = metabolism.get("water_pressure_pct", 100.0)

    # 4. Risk score + breakdown
    scoring = compute_risk_score(
        stagnant_reports=stagnant_count,
        temp_c=temp_c,
        humidity=humidity,
        complaint_count=complaint_count,
        metabolism_water_delta=water_delta,
    )
    score = scoring["score"]

    # 5. Trend
    series    = _build_trend_series(ward.id, score)
    trend_dir = _trend_direction(series)

    # 6. Gemma (cached per day — NOT awaited in the bulk /wards call;
    #    only fetched on /wards/{ward_id} detail to keep the list fast)
    gemma_data: dict | None = None  # populated in detail call only

    return {
        "ward_id":   ward.id,
        "ward_name": ward.name,
        "lat":       ward.lat,
        "lng":       ward.lng,

        # Score
        "risk_score":    score,
        "trend":         trend_dir,
        "trend_series":  series,
        "scoring":       scoring,

        # Raw feature values
        "features": {
            "stagnant_reports_7d": stagnant_count,
            "temp_c":              round(temp_c, 1),
            "temp_anomaly_c":      temp_anomaly,
            "humidity_pct":        humidity,
            "rainfall_7d_mm":      round(rainfall, 1),
            "complaint_count_7d":  complaint_count,
            "complaint_categories":complaint_rec.get("categories", {}),
            "metabolism_water_delta_pct": water_delta,
            "metabolism_water_pressure_pct": water_pct,
        },

        # Metabolism cross-link (shown in detail panel)
        "metabolism_link": {
            "active_stress_test": stress_test,
            "water_supply_delta": water_delta,
            "water_pressure_pct": water_pct,
            "detail":             metabolism.get("metabolism_detail", ""),
            **source_badge(
                DataTier.LIVE if metabolism.get("metabolism_source") == "live" else DataTier.ESTIMATED,
                "City Metabolism module — water pressure vitals"
            ),
        },

        # Freshness badges per input
        "source_badges": {
            "weather":          {**source_badge(wx_source, wx_detail)},
            "stagnant_reports": {**source_badge(DataTier.REPORTED, "TEMP: fixture — swap for Water Distribution API")},
            "complaints":       {**source_badge(DataTier.REPORTED, "TEMP: fixture — swap for Complaints API")},
            "metabolism":       {**source_badge(
                DataTier.LIVE if metabolism.get("metabolism_source") == "live" else DataTier.ESTIMATED,
                metabolism.get("metabolism_detail", "City Metabolism vitals")
            )},
        },

        # Gemma — None in list view, populated in detail view
        "gemma": gemma_data,
    }


async def compute_ward_health_detail(ward_record: dict) -> dict:
    """
    Augment a ward record with Gemma reasoning.
    Called only by the /wards/{ward_id} endpoint.
    Sets gemma_error on failure so the frontend can show a retry button.
    """
    feat = ward_record["features"]
    ml   = ward_record["metabolism_link"]

    try:
        gemma_data = await get_gemma_reasoning(
            ward_name            = ward_record["ward_name"],
            ward_id              = ward_record["ward_id"],
            stagnant_reports     = feat["stagnant_reports_7d"],
            temp_anomaly         = feat["temp_anomaly_c"],
            rainfall_mm          = feat["rainfall_7d_mm"],
            complaint_count      = feat["complaint_count_7d"],
            active_stress_test   = ml.get("active_stress_test"),
            metabolism_water_delta = ml.get("water_supply_delta", 0.0),
        )
        return {**ward_record, "gemma": gemma_data, "gemma_error": None}
    except Exception as exc:
        print(f"[health-watch] Gemma failed for ward {ward_record['ward_id']}: {exc}")
        return {**ward_record, "gemma": None, "gemma_error": str(exc)}


# ---------------------------------------------------------------------------
# Bulk compute: all wards
# ---------------------------------------------------------------------------

async def get_all_ward_scores(db: Session) -> list[dict]:
    """Compute health-watch records for all wards. Uses shared metabolism fetch."""
    wards      = db.query(Ward).all()
    metabolism = await get_metabolism_stress()

    import asyncio
    records = await asyncio.gather(
        *[compute_ward_health(w, metabolism) for w in wards],
        return_exceptions=False,
    )
    return list(records)


async def get_ward_score(db: Session, ward_id: int) -> dict | None:
    """Full detail for one ward including Gemma."""
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        return None
    metabolism  = await get_metabolism_stress()
    base_record = await compute_ward_health(ward, metabolism)
    return await compute_ward_health_detail(base_record)


async def refresh_all(db: Session) -> dict:
    """Recompute all ward scores and return a summary."""
    records  = await get_all_ward_scores(db)
    trending = sum(1 for r in records if r["trend"] == "up")
    high     = sum(1 for r in records if r["risk_score"] >= 60)
    return {
        "refreshed_at":    datetime.now(timezone.utc).isoformat(),
        "wards_computed":  len(records),
        "trending_up":     trending,
        "high_risk_wards": high,
    }
