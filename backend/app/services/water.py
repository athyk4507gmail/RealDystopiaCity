import asyncio
import logging
from datetime import date, timedelta
from typing import Optional
import random
from sqlalchemy.orm import Session

from app.models import Ward, WaterComplaint, WaterSchedule
from app.services.data_sources import DataTier, source_badge
from app.services.fairness import (
    TARGET_SUPPLY_GAP_DAYS,
    compute_fairness_score,
    is_forced_supply,
    priority_label,
)
from app.services.gemma import gemma
from app.services.rag_retrieval import get_similar_resolved_complaints

logger = logging.getLogger("dystopiacity.water")

LEGACY_PLACEHOLDER_MARKER = "standard allocation"


WATER_SCHEDULE_REASONING_PROMPT = """You rewrite water supply scheduling facts into one clear, concise sentence for citizens.
Explain the scheduling decision ONLY using the provided real data fields (e.g., days since last supply, fairness score, active complaints).
CRITICAL: Do NOT invent or hallucinate reasons like "citywide budget exhausted", "priority wards", "maintenance", or "pipeline issues".
If supply_today is false, explain honestly that the ward is on a scheduled rotation and it is not yet their turn based on the fairness score and target gap days.
Return JSON: { "reasoning": string }"""

WATER_TRIAGE_RAG_PROMPT = """You are a BWSSB water utility triage assistant.
Base your recommendation only on the historical cases provided below.
If fewer than 2 relevant cases are provided, say plainly that there isn't enough history yet and give a general estimate instead of a confident precedent-based one.
Do not invent past cases that weren't given to you.
Weight same-ward precedents higher than citywide precedents.
In your reasoning field, write 2-3 sentences citing specific precedent cases by number, including typical resolution time and team used.

Return JSON:
{
  "severity": "low|medium|high|critical",
  "recommended_team": "string",
  "eta_hours_low": number,
  "eta_hours_high": number,
  "reasoning": "2-3 sentences citing the precedent used",
  "based_on_cases": number
}"""

ISSUE_TYPE_ALIASES = {
    "supply_disruption": "no-supply",
    "no_supply": "no-supply",
    "low_pressure": "low-pressure",
    "general": "no-supply",
    "maintenance": "low-pressure",
    "other": "no-supply",
}

SUB_LOCALITY_TEMPLATES = [
    "Main Road",
    "Market Area",
    "Apartment Cluster",
    "School Zone",
    "Tank Road",
    "Bus Stand Area",
]


def _normalize_issue_type(issue_type: str) -> str:
    key = issue_type.strip().lower().replace(" ", "-").replace("_", "-")
    return ISSUE_TYPE_ALIASES.get(key, key)


def _default_supply_window(priority: str, ward_index: int) -> tuple[str, str]:
    slots = {
        "High": ("05:30", "08:30"),
        "Medium": ("08:00", "11:00"),
        "Low": ("14:00", "17:00"),
    }
    start, end = slots.get(priority, ("09:00", "12:00"))
    offset = (ward_index % 3) * 30
    start_h, start_m = map(int, start.split(":"))
    end_h, end_m = map(int, end.split(":"))
    start_m += offset
    end_m += offset
    if start_m >= 60:
        start_h += 1
        start_m -= 60
    if end_m >= 60:
        end_h += 1
        end_m -= 60
    return f"{start_h:02d}:{start_m:02d}", f"{end_h:02d}:{end_m:02d}"


def generate_sub_localities(ward_name: str, allocation_litres: float) -> list[dict]:
    count = random.randint(3, 5)
    names = [f"{ward_name} {suffix}" for suffix in random.sample(SUB_LOCALITY_TEMPLATES, count)]
    weights = list(range(count, 0, -1))
    total_weight = sum(weights)
    remaining = allocation_litres
    sub_localities = []

    for index, (name, weight) in enumerate(zip(names, weights)):
        if index == len(names) - 1:
            litres = round(remaining)
        else:
            litres = round(allocation_litres * weight / total_weight)
            remaining -= litres
        sub_localities.append({
            "name": name,
            "priority_rank": index + 1,
            "allocation_litres": litres,
        })

    return sub_localities


def _display_reasoning(schedule: WaterSchedule) -> str:
    if schedule.overridden and schedule.override_reason:
        return f"Manually adjusted by staff: {schedule.override_reason}"
    return schedule.reasoning


def _schedule_to_dict(schedule: WaterSchedule, ward_name: str) -> dict:
    sub_localities = schedule.sub_localities or generate_sub_localities(
        ward_name, schedule.allocation_litres
    )
    return {
        "ward_id": schedule.ward_id,
        "ward_name": ward_name,
        "supply_today": schedule.supply_today,
        "allocation_litres": round(schedule.allocation_litres),
        "duration_hours": schedule.duration_hours,
        "supply_start_time": schedule.supply_start_time,
        "supply_end_time": schedule.supply_end_time,
        "priority": schedule.priority,
        "reasoning": _display_reasoning(schedule),
        "fairness_score": schedule.fairness_score,
        "days_since_supply": schedule.days_since_supply,
        "forced_supply": schedule.forced_supply,
        "overridden": bool(schedule.overridden),
        "override_reason": schedule.override_reason,
        "sub_localities": sub_localities,
        **source_badge(DataTier.ESTIMATED, "Schedule from fairness engine + census-grounded ward data"),
    }


def get_wards(db: Session) -> list[dict]:
    wards = db.query(Ward).all()
    return [_ward_to_dict(w) for w in wards]


def _ward_to_dict(w: Ward) -> dict:
    days_since = (date.today() - w.last_supply_date).days
    return {
        "id": w.id,
        "name": w.name,
        "population": int(w.population),
        "houses": int(w.houses),
        "tank_capacity_litres": round(w.tank_capacity_litres),
        "available_water_litres": round(w.available_water_litres),
        "last_supply_date": w.last_supply_date.isoformat(),
        "days_since_supply": days_since,
        "avg_daily_consumption": round(w.avg_daily_consumption),
        "complaints": w.complaints,
        "leakage_reports": w.leakage_reports,
        "temperature_c": w.temperature_c,
        "growth_rate_pct": w.growth_rate_pct,
        "lat": w.lat,
        "lng": w.lng,
        "polygon": w.polygon,
        **source_badge(DataTier.REPORTED, "Ward identity is real; population is 2011 census projected forward"),
    }


def _open_complaints_for_ward(db: Session, ward_id: int) -> int:
    return (
        db.query(WaterComplaint)
        .filter(WaterComplaint.ward_id == ward_id, WaterComplaint.status == "open")
        .count()
    )


def _fallback_schedule_reasoning(
    ward: Ward,
    *,
    supply_today: bool,
    days_since: int,
    fairness_score: float,
    forced: bool,
    open_issues: int,
) -> str:
    if supply_today:
        forced_note = " (mandatory — exceeded supply gap limit)" if forced else ""
        return (
            f"Ward {ward.name} prioritized — {days_since} days since last supply "
            f"(limit: {TARGET_SUPPLY_GAP_DAYS} days), covering approximately "
            f"{int(ward.houses):,} households, {open_issues} active complaint(s){forced_note}."
        )
    return (
        f"Ward {ward.name} not scheduled today — waiting for next scheduled rotation "
        f"({days_since} days since last supply, fairness score {fairness_score:.1f})."
    )


async def _phrase_schedule_reasoning(
    ward: Ward,
    *,
    supply_today: bool,
    days_since: int,
    fairness_score: float,
    forced: bool,
    open_issues: int,
) -> str:
    facts = {
        "ward_name": ward.name,
        "supply_today": supply_today,
        "days_since_supply": days_since,
        "target_gap_days": TARGET_SUPPLY_GAP_DAYS,
        "forced_supply": forced,
        "fairness_score": round(fairness_score, 2),
        "households": int(ward.houses),
        "active_complaints": open_issues,
        "open_leakage_reports": ward.leakage_reports,
    }

    prompt = f"Facts to restate in one sentence:\n{facts}"
    logger.info("Gemma schedule reasoning call starting for ward=%s", ward.name)
    try:
        response = await asyncio.wait_for(
            gemma.generate(
                WATER_SCHEDULE_REASONING_PROMPT,
                prompt,
                fallback_type="water_planning",
                timeout=2.0,
            ),
            timeout=2.5,
        )
        logger.info(
            "Gemma schedule reasoning response for ward=%s (first 200 chars): %s",
            ward.name,
            (response or "")[:200],
        )
        parsed = gemma.parse_json(response)
        reasoning = str(parsed.get("reasoning", "")).strip()
        if reasoning:
            return reasoning
    except Exception as exc:
        logger.warning(
            "Gemma schedule reasoning failed for ward=%s: %s",
            ward.name,
            exc,
            exc_info=True,
        )
    return _fallback_schedule_reasoning(
        ward,
        supply_today=supply_today,
        days_since=days_since,
        fairness_score=fairness_score,
        forced=forced,
        open_issues=open_issues,
    )


async def generate_schedule(db: Session) -> list[dict]:
    wards = db.query(Ward).all()
    today = date.today()

    scored: list[dict] = []
    for ward in wards:
        days_since = (today - ward.last_supply_date).days
        score = compute_fairness_score(ward, days_since_supply=days_since)
        forced = is_forced_supply(ward, days_since_supply=days_since)
        scored.append({
            "ward": ward,
            "days_since": days_since,
            "score": score,
            "forced": forced,
        })

    forced_wards = sorted(
        [s for s in scored if s["forced"]],
        key=lambda x: (-x["score"], x["ward"].id),
    )
    other_wards = sorted(
        [s for s in scored if not s["forced"]],
        key=lambda x: (-x["score"], x["ward"].id),
    )
    priority_order = forced_wards + other_wards

    city_budget = round(sum(w.available_water_litres for w in wards) * 0.16)
    remaining_budget = city_budget
    scheduled_ward_ids: set[int] = set()
    allocations: dict[int, float] = {}

    min_allocation = 8000
    for entry in priority_order:
        ward = entry["ward"]
        need = round(ward.avg_daily_consumption * 1.05)
        if remaining_budget < min_allocation and not entry["forced"]:
            continue
        alloc = min(need, remaining_budget)
        if alloc < min_allocation and not entry["forced"]:
            continue
        if alloc <= 0:
            continue
        allocations[ward.id] = alloc
        remaining_budget -= alloc
        scheduled_ward_ids.add(ward.id)

    pending_schedules = []
    for index, entry in enumerate(priority_order):
        ward = entry["ward"]
        days_since = entry["days_since"]
        score = entry["score"]
        forced = entry["forced"]
        supply_today = ward.id in scheduled_ward_ids
        allocation = allocations.get(ward.id, 0)
        priority = priority_label(score, forced)
        open_issues = _open_complaints_for_ward(db, ward.id)

        reasoning = await _phrase_schedule_reasoning(
            ward,
            supply_today=supply_today,
            days_since=days_since,
            fairness_score=score,
            forced=forced,
            open_issues=open_issues,
        )

        default_start, default_end = _default_supply_window(priority, index)
        duration = round(max(1.5, allocation / max(ward.avg_daily_consumption, 1) * 2), 1) if supply_today else 0
        sub_localities = generate_sub_localities(ward.name, allocation) if supply_today else []

        schedule = WaterSchedule(
            ward_id=ward.id,
            supply_today=supply_today,
            allocation_litres=allocation,
            duration_hours=duration,
            supply_start_time=default_start if supply_today else "00:00",
            supply_end_time=default_end if supply_today else "00:00",
            priority=priority,
            reasoning=reasoning,
            sub_localities=sub_localities,
            schedule_date=today,
            fairness_score=round(score, 2),
            days_since_supply=days_since,
            forced_supply=forced,
        )
        pending_schedules.append((schedule, ward.name))

    db.query(WaterSchedule).filter(WaterSchedule.schedule_date == today).delete()
    results = []
    for schedule, ward_name in pending_schedules:
        db.add(schedule)
        results.append(_schedule_to_dict(schedule, ward_name))

    db.commit()
    return results


async def get_today_schedule(db: Session) -> list[dict]:
    today = date.today()
    schedules = db.query(WaterSchedule).filter(WaterSchedule.schedule_date == today).all()
    stale = (
        not schedules
        or any(LEGACY_PLACEHOLDER_MARKER in (s.reasoning or "") for s in schedules)
        or any(s.fairness_score is None for s in schedules)
    )
    if stale:
        logger.info(
            "Regenerating stale schedule for %s (rows=%s, legacy=%s)",
            today,
            len(schedules),
            any(LEGACY_PLACEHOLDER_MARKER in (s.reasoning or "") for s in schedules),
        )
        return await generate_schedule(db)

    ward_map = {w.id: w for w in db.query(Ward).all()}
    return [
        _schedule_to_dict(
            s,
            ward_map[s.ward_id].name if s.ward_id in ward_map else "Unknown",
        )
        for s in schedules
    ]


def get_fairness_warnings(db: Session) -> list[dict]:
    """Wards approaching the fairness supply-gap limit (e.g. 3/4 days)."""
    warnings = []
    for ward in db.query(Ward).all():
        days = (date.today() - ward.last_supply_date).days
        if TARGET_SUPPLY_GAP_DAYS - 1 <= days < TARGET_SUPPLY_GAP_DAYS:
            warnings.append({
                "ward_name": ward.name,
                "days_since_supply": days,
                "limit_days": TARGET_SUPPLY_GAP_DAYS,
            })
    warnings.sort(key=lambda w: (-w["days_since_supply"], w["ward_name"]))
    return warnings


def override_schedule(
    db: Session,
    ward_id: int,
    supply_today: bool,
    override_reason: str,
) -> dict:
    reason = override_reason.strip()
    if not reason:
        raise ValueError("override_reason is required")

    today = date.today()
    schedule = (
        db.query(WaterSchedule)
        .filter(WaterSchedule.ward_id == ward_id, WaterSchedule.schedule_date == today)
        .first()
    )
    if not schedule:
        raise ValueError("No schedule row exists for this ward today — regenerate first")

    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    schedule.supply_today = supply_today
    schedule.overridden = True
    schedule.override_reason = reason
    if not supply_today:
        schedule.allocation_litres = 0
        schedule.duration_hours = 0
    schedule.reasoning = f"Manually adjusted by staff: {reason}"

    db.commit()
    db.refresh(schedule)
    return _schedule_to_dict(schedule, ward.name if ward else "Unknown")


def predict_demand(db: Session, ward_id: int, days: int = 14) -> list[dict]:
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        return []

    base = ward.avg_daily_consumption
    seasonal = 1.0 + (ward.temperature_c - 30) * 0.03
    growth = 1.0 + ward.growth_rate_pct / 100 / 12
    predictions = []
    for d in range(days):
        day_factor = 1.1 if d % 7 in (5, 6) else 1.0
        festival_spike = 1.25 if d == 10 else 1.0
        predicted = base * seasonal * growth * day_factor * festival_spike
        predictions.append({
            "day": (date.today() + timedelta(days=d)).isoformat(),
            "predicted_litres": round(predicted),
            "confidence": round(0.85 + random.uniform(-0.05, 0.05), 2),
            **source_badge(DataTier.ESTIMATED, "Forecast derived from ward consumption and weather factors"),
        })
    return predictions


async def detect_leakage(image_b64: str) -> dict:
    system = (
        "You are a water infrastructure inspector. Analyze the image for pipe leakage, "
        "overflow, or broken pipeline. Respond in JSON: "
        '{ "is_leakage", "confidence", "type", "reasoning" }.'
    )
    response = await gemma.generate(
        system,
        "Analyze this image for water leakage.",
        image_b64=image_b64,
        fallback_type="water_leakage",
    )
    return gemma.parse_json(response)


def create_complaint(db: Session, ward_id: int, ctype: str, description: str, image_url: Optional[str] = None) -> dict:
    complaint = WaterComplaint(
        ward_id=ward_id,
        type=_normalize_issue_type(ctype),
        description=description,
        image_url=image_url,
    )
    db.add(complaint)
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if ward:
        ward.complaints += 1
        if ctype in ("leakage", "leak"):
            ward.leakage_reports += 1
    db.commit()
    db.refresh(complaint)
    return _complaint_to_dict(complaint, ward.name if ward else "Unknown")


def _complaint_to_dict(complaint: WaterComplaint, ward_name: str) -> dict:
    return {
        "id": complaint.id,
        "ward_id": complaint.ward_id,
        "ward_name": ward_name,
        "type": complaint.type,
        "description": complaint.description,
        "status": complaint.status,
        "created_at": complaint.created_at.isoformat(),
        "resolved_at": complaint.resolved_at.isoformat() if complaint.resolved_at else None,
        "resolution_comment": complaint.resolution_comment,
        "assigned_team": complaint.assigned_team,
        **source_badge(
            DataTier.ESTIMATED,
            "Synthetic seed history" if complaint.is_synthetic_seed else "Citizen report",
        ),
    }


def get_complaints(db: Session, ward_id: Optional[int] = None, status: Optional[str] = None) -> list[dict]:
    q = db.query(WaterComplaint)
    if ward_id:
        q = q.filter(WaterComplaint.ward_id == ward_id)
    if status:
        q = q.filter(WaterComplaint.status == status)

    ward_map = {w.id: w.name for w in db.query(Ward).all()}
    return [
        _complaint_to_dict(c, ward_map.get(c.ward_id, "Unknown"))
        for c in q.order_by(WaterComplaint.created_at.desc()).all()
    ]


def resolve_ward_id(db: Session, ward_id: Optional[int], ward_name: Optional[str]) -> Optional[int]:
    if ward_id:
        return ward_id
    if not ward_name:
        return None
    normalized = ward_name.strip().lower().replace("shivajinagar", "shivaji nagar").replace("malleswaram", "malleshwaram")
    for ward in db.query(Ward).all():
        if ward.name.lower() == normalized:
            return ward.id
    return None


def _format_precedent_cases(cases: list[dict]) -> str:
    if not cases:
        return "No historical cases available."
    lines = []
    for i, case in enumerate(cases, 1):
        scope = "same ward" if case.get("scope") == "same_ward" else "citywide"
        lines.append(
            f"{i}. [{scope}] {case['description']} | "
            f"Resolution: {case['resolution_comment']} | "
            f"Duration: {case.get('duration_hours', 'unknown')}h | "
            f"Team: {case['assigned_team']}"
        )
    return "\n".join(lines)


def _fallback_triage(issue_type: str, case_count: int) -> dict:
    return {
        "severity": "medium",
        "recommended_team": "Pipeline Team A",
        "eta_hours_low": 6,
        "eta_hours_high": 12,
        "reasoning": (
            f"Not enough ward history ({case_count} case(s)) for a precedent-based estimate. "
            "General response: dispatch field team and update citizens within 24 hours."
        ),
        "based_on_cases": case_count,
        "fallback": True,
        "retrieved_cases": [],
    }


async def triage_complaint_with_precedent(
    db: Session,
    description: str,
    issue_type: str,
    ward_id: Optional[int] = None,
    ward_name: Optional[str] = None,
) -> dict:
    normalized_type = _normalize_issue_type(issue_type)
    resolved_ward_id = resolve_ward_id(db, ward_id, ward_name)

    retrieved_cases: list[dict] = []
    if resolved_ward_id:
        retrieved_cases = get_similar_resolved_complaints(db, resolved_ward_id, normalized_type)

    ward_stats = {}
    if resolved_ward_id:
        ward = db.query(Ward).filter(Ward.id == resolved_ward_id).first()
        if ward:
            ward_stats = {
                "name": ward.name,
                "days_since_supply": (date.today() - ward.last_supply_date).days,
                "active_open_complaints": _open_complaints_for_ward(db, ward.id),
                "leakage_reports": ward.leakage_reports,
            }

    case_block = _format_precedent_cases(retrieved_cases)

    if len(retrieved_cases) < 2:
        fallback = _fallback_triage(normalized_type, len(retrieved_cases))
        fallback["retrieved_cases"] = retrieved_cases
        return fallback

    prompt = (
        f"New complaint type: {normalized_type}\n"
        f"Description: {description}\n"
        f"Ward stats: {ward_stats}\n\n"
        f"Historical resolved cases ({len(retrieved_cases)}):\n{case_block}"
    )
    full_prompt = f"SYSTEM:\n{WATER_TRIAGE_RAG_PROMPT}\n\nUSER:\n{prompt}"
    logger.info("Gemma triage FULL prompt:\n%s", full_prompt)

    try:
        logger.info(
            "Gemma triage call starting ward_id=%s type=%s cases=%s",
            resolved_ward_id,
            normalized_type,
            len(retrieved_cases),
        )
        response = await asyncio.wait_for(
            gemma.generate(WATER_TRIAGE_RAG_PROMPT, prompt, max_tokens=1536),
            timeout=20.0,
        )
        logger.info("Gemma triage FULL raw response:\n%s", response or "")
        result = gemma.parse_json(response)
        if "severity" not in result:
            raise ValueError("missing severity")
        result["based_on_cases"] = int(result.get("based_on_cases", len(retrieved_cases)))
        result["retrieved_cases"] = retrieved_cases
        result["fallback"] = False
        return result
    except Exception as exc:
        logger.warning("Gemma triage failed: %s", exc, exc_info=True)
        fallback = _fallback_triage(normalized_type, len(retrieved_cases))
        fallback["retrieved_cases"] = retrieved_cases
        return fallback


async def triage_complaint(description: str, issue_type: str) -> dict:
    """Backward-compatible wrapper without DB context."""
    return _fallback_triage(_normalize_issue_type(issue_type), 0)


async def draft_announcement(area: str, hint: str) -> dict:
    system = (
        "You are a municipal communications assistant for BWSSB water utility. "
        "Draft a concise, professional citizen announcement. "
        "Return JSON: { \"draft\": string }. "
        "Keep the draft under 60 words. Use a courteous, reassuring tone."
    )
    prompt = f"Area: {area}. Staff note: {hint}"
    try:
        response = await gemma.generate(system, prompt)
        result = gemma.parse_json(response)
        if "draft" not in result:
            raise ValueError("missing draft")
        return result
    except Exception:
        return {
            "draft": (
                f"Dear residents of {area}, we wish to inform you of a scheduled water supply disruption. "
                f"Our teams are working to restore services promptly. We apologize for the inconvenience."
            ),
        }


async def answer_citizen_question(question: str, ward_context: dict) -> dict:
    system = (
        "You are a helpful BWSSB water supply assistant answering citizen questions. "
        "Use only the provided ward data. Answer in 2-3 clear sentences, using specific numbers "
        "from the ward context provided (days since supply, time windows, complaint counts). "
        "Return JSON: { \"answer\": string }."
    )
    ctx = {
        "ward": ward_context.get("name", "your ward"),
        "supply_today": ward_context.get("supply_today"),
        "supply_start": ward_context.get("supply_start_time", "N/A"),
        "supply_end": ward_context.get("supply_end_time", "N/A"),
        "days_since_supply": ward_context.get("days_since_supply"),
        "open_issues": ward_context.get("open_issues", 0),
    }
    prompt = f"Ward info: {ctx}. Citizen question: {question}"
    full_prompt = f"SYSTEM:\n{system}\n\nUSER:\n{prompt}"
    logger.info("Gemma citizen Q&A FULL prompt:\n%s", full_prompt)
    try:
        response = await asyncio.wait_for(
            gemma.generate(system, prompt, max_tokens=1024),
            timeout=15.0,
        )
        logger.info("Gemma citizen Q&A FULL raw response:\n%s", response or "")
        result = gemma.parse_json(response)
        if "answer" not in result:
            raise ValueError("missing answer")
        return result
    except Exception:
        supply_msg = (
            f"Supply is scheduled today from {ward_context.get('supply_start_time', 'N/A')} "
            f"to {ward_context.get('supply_end_time', 'N/A')}."
            if ward_context.get("supply_today")
            else "No supply is scheduled for today in your ward."
        )
        return {"answer": f"{supply_msg} Please store water in advance and report issues through the portal."}


async def issue_insights(issue_summary: list[dict]) -> dict:
    system = (
        "You are a municipal operations analyst. Given a summary of recent water issues, "
        "write a 2-sentence insight for staff. "
        "Return JSON: { \"summary\": string }. Be specific and actionable."
    )
    prompt = f"Issue breakdown (type and count): {issue_summary}"
    try:
        response = await gemma.generate(system, prompt)
        result = gemma.parse_json(response)
        if "summary" not in result:
            raise ValueError("missing summary")
        return result
    except Exception:
        top = issue_summary[0] if issue_summary else {"type": "general", "count": 0}
        return {
            "summary": (
                f"The most frequent issue type is '{top.get('type', 'general')}' with {top.get('count', 0)} reports. "
                "Consider deploying additional field teams to high-complaint wards and scheduling preventive maintenance."
            ),
        }
