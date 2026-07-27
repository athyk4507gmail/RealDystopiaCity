from app.services.gemma import gemma
from app.services.metabolism import get_vital_signs
from app.services.traffic import get_traffic_feed
from app.services.water import get_today_schedule, get_wards


async def chat(message: str, module: str, db) -> dict:
    context = await _build_context(module, db)
    system = (
        f"You are CityPulse AI, a municipal intelligence assistant for the {module} module. "
        f"Answer questions using the provided live data. Be concise and helpful.\n\n"
        f"Current data context:\n{context}"
    )
    response = await gemma.generate(system, message, json_mode=False)
    parsed = gemma.parse_json(response)
    content = parsed.get("response", response) if isinstance(parsed, dict) else response
    return {"role": "assistant", "content": content, "module": module}


async def _build_context(module: str, db) -> str:
    if module in ("water", "global"):
        wards = await get_wards(db)
        schedule = await get_today_schedule(db)
        return f"Wards: {wards[:5]}...\nSchedule: {schedule[:5]}..."
    if module in ("traffic", "traffic-mood", "global"):
        feed = get_traffic_feed(db)
        return f"Traffic feed: {feed}"
    if module == "trust-score":
        from app.services.trust_score import get_routes
        routes = await get_routes(db)
        return f"Bus routes: {routes[:5]}..."
    if module == "risk-zones":
        from app.services.risk_zones import get_risk_segments
        segments = get_risk_segments(db)
        return f"Risk segments: {segments[:5]}..."
    if module == "metabolism":
        vitals = await get_vital_signs(db)
        return f"City vitals: {vitals}"
    return "No specific context available."
