from app.services.gemma import gemma
from app.services.metabolism import get_vital_signs
from app.services.traffic import get_traffic_feed
from app.services.water import get_today_schedule, get_wards


async def chat(message: str, module: str, db) -> dict:
    context = await _build_context(module, db)
    system = (
        f"You are DystopiaCITY, a municipal intelligence assistant for the {module} module. "
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
        # Build a concise summary: supply status per ward, not raw dicts
        supply_lines = [
            f"{w.get('name','?')}: supply_today={w.get('supply_today')}, "
            f"days_since={w.get('days_since_supply')}, open_issues={w.get('open_issues', 0)}"
            for w in wards
        ]
        sched_lines = [
            f"{s.get('ward_name','?')}: {s.get('supply_start_time','?')}-{s.get('supply_end_time','?')}, "
            f"fairness={s.get('fairness_score')}"
            for s in schedule
        ]
        return (
            f"Water supply status ({len(wards)} wards):\n" + "\n".join(supply_lines) +
            f"\n\nToday's schedule ({len(sched_lines)} wards):\n" + "\n".join(sched_lines)
        )
    if module in ("traffic", "traffic-mood", "global"):
        feed = get_traffic_feed(db)
        # Summarise by congestion level
        congested = [s for s in feed if (s.get("congestion_pct") or 0) >= 60]
        moderate  = [s for s in feed if 30 <= (s.get("congestion_pct") or 0) < 60]
        clear     = [s for s in feed if (s.get("congestion_pct") or 0) < 30]
        return (
            f"Traffic signal summary ({len(feed)} signals): "
            f"{len(congested)} congested (>=60%), {len(moderate)} moderate, {len(clear)} clear.\n"
            "Congested signals: " + ", ".join(
                f"{s.get('name')} ({s.get('congestion_pct'):.0f}%, q={s.get('queue_length')})"
                for s in sorted(congested, key=lambda x: -(x.get("congestion_pct") or 0))[:8]
            )
        )
    if module == "trust-score":
        from app.services.trust_score import get_routes
        routes = await get_routes(db)
        route_lines = [
            f"{r.get('route_name','?')}: trust={r.get('trust_score')}, reliability={r.get('reliability_pct')}%"
            for r in routes
        ]
        return f"Bus route trust scores ({len(routes)} routes):\n" + "\n".join(route_lines)
    if module == "risk-zones":
        from app.services.risk_zones import get_risk_segments, get_reported_black_spots
        segments = get_risk_segments(db)
        black_spots = get_reported_black_spots()
        high_risk = [s for s in segments if (s.get("risk_score") or 0) >= 60]
        return (
            f"Risk zones: {len(segments)} AI-scored segments, {len(black_spots)} reported black spots.\n"
            f"High-risk (>=60) segments: " + ", ".join(
                f"{s.get('name')} (score={s.get('risk_score')}, accidents={s.get('accident_count')})"
                for s in sorted(high_risk, key=lambda x: -(x.get("risk_score") or 0))[:6]
            )
        )
    if module == "metabolism":
        vitals = await get_vital_signs(db)
        return (
            f"City vital signs: water_pressure={vitals.get('water_pressure')}%, "
            f"traffic_flow={vitals.get('traffic_flow')}%, "
            f"energy_load={vitals.get('energy_load')}%, "
            f"air_quality={vitals.get('air_quality_index')}, "
            f"resilience_score={vitals.get('resilience_score')}"
        )
    if module == "health-watch":
        from app.services.health_watch import get_all_ward_scores
        scores = await get_all_ward_scores(db)
        high_risk_wards = sorted(
            [w for w in scores if (w.get("risk_score") or 0) >= 50],
            key=lambda w: -(w.get("risk_score") or 0)
        )
        return (
            f"Health Watch ({len(scores)} wards monitored). "
            f"High-risk wards (score>=50): " + ", ".join(
                f"{w.get('ward_name','?')} (score={w.get('risk_score')})"
                for w in high_risk_wards[:6]
            )
        )
    return "No specific context available."
