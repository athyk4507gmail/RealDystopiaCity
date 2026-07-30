from sqlalchemy.orm import Session

from app.services.gemma import gemma
from app.services.data_sources import DataTier, source_badge
from app.services.traffic import get_traffic_feed
from app.services.water import get_wards, get_today_schedule


CASCADE_GRAPH = {
    "heatwave": {
        "water": {"effect": -0.18, "label": "Water reserves drop 18%"},
        "traffic": {"effect": 0.25, "label": "Tanker traffic increases 25%"},
        "energy": {"effect": 0.30, "label": "AC load spikes 30%"},
        "air_quality": {"effect": -0.10, "label": "AQI worsens 10%"},
    },
    "festival": {
        "water": {"effect": -0.12, "label": "Demand surge depletes reserves 12%"},
        "traffic": {"effect": 0.45, "label": "Road congestion rises 45%"},
        "energy": {"effect": 0.15, "label": "Street lighting load up 15%"},
        "air_quality": {"effect": -0.08, "label": "AQI slightly worse"},
    },
    "pipe_burst": {
        "water": {"effect": -0.35, "label": "Ward water supply cut 35%"},
        "traffic": {"effect": 0.20, "label": "Repair crews cause 20% traffic slowdown"},
        "energy": {"effect": 0.05, "label": "Pumping stations work harder"},
        "air_quality": {"effect": 0.0, "label": "No significant change"},
    },
    "protest": {
        "water": {"effect": 0.0, "label": "No direct water impact"},
        "traffic": {"effect": 0.55, "label": "Central roads blocked, 55% detour traffic"},
        "energy": {"effect": 0.0, "label": "No significant change"},
        "air_quality": {"effect": -0.05, "label": "Idling vehicles worsen AQI slightly"},
    },
}

NODE_CONNECTIONS = [
    ("water", "traffic"),
    ("traffic", "air_quality"),
    ("water", "energy"),
    ("energy", "air_quality"),
]


async def get_vital_signs(db: Session) -> dict:
    wards = await get_wards(db)
    schedule = await get_today_schedule(db)
    traffic = get_traffic_feed(db)

    avg_water = sum(w["available_water_litres"] for w in wards) / len(wards) if wards else 0
    avg_congestion = sum(t["congestion_pct"] for t in traffic) / len(traffic) if traffic else 0
    high_priority = sum(1 for s in schedule if s.get("priority") == "High")

    return {
        "water_pressure": round(min(100, avg_water / 1500), 1),
        "traffic_flow": round(max(0, 100 - avg_congestion), 1),
        "energy_load": round(65 + avg_congestion * 0.2, 1),
        "air_quality_index": round(85 - high_priority * 2, 1),
        "timestamp": "live",
        **source_badge(DataTier.ESTIMATED, "Derived from current water and traffic module states"),
    }


async def run_stress_test(db: Session, event_type: str) -> dict:
    cascade = CASCADE_GRAPH.get(event_type, CASCADE_GRAPH["heatwave"])
    vitals_before = await get_vital_signs(db)

    nodes = []
    for node_name, effect in cascade.items():
        nodes.append({
            "id": node_name,
            "label": node_name.replace("_", " ").title(),
            "effect": effect["effect"],
            "description": effect["label"],
            "status": "stressed" if abs(effect["effect"]) > 0.15 else "normal",
        })

    edges = [{"from": a, "to": b, "weight": 0.7} for a, b in NODE_CONNECTIONS]

    vitals_after = {
        "water_pressure": round(vitals_before["water_pressure"] * (1 + cascade["water"]["effect"]), 1),
        "traffic_flow": round(vitals_before["traffic_flow"] * (1 - cascade["traffic"]["effect"]), 1),
        "energy_load": round(vitals_before["energy_load"] * (1 + cascade["energy"]["effect"]), 1),
        "air_quality_index": round(vitals_before["air_quality_index"] * (1 + cascade["air_quality"]["effect"]), 1),
    }

    resilience = round(
        100
        - abs(cascade["water"]["effect"]) * 40
        - abs(cascade["traffic"]["effect"]) * 35
        - abs(cascade["energy"]["effect"]) * 15
        - abs(cascade["air_quality"]["effect"]) * 10,
        1,
    )

    system = (
        "You are a city systems analyst describing cross-domain cascade effects. "
        "Given computed cascade data, generate a plain-language narrative. "
        'Respond in JSON: { "narrative", "resilience_index" }.'
    )
    prompt = f"Stress event: {event_type}. Cascade effects: {cascade}. Vitals before: {vitals_before}. After: {vitals_after}."
    try:
        import asyncio
        response = await asyncio.wait_for(gemma.generate(system, prompt), timeout=10.0)
        narration = gemma.parse_json(response)
    except asyncio.TimeoutError:
        narration = {"narrative": f"Stress event {event_type} triggered cascade effects across city systems.", "resilience_index": resilience}

    return {
        "event_type": event_type,
        "nodes": nodes,
        "edges": edges,
        "vitals_before": vitals_before,
        "vitals_after": vitals_after,
        "resilience_index": narration.get("resilience_index", resilience),
        "narrative": narration.get("narrative", ""),
        "cascade_steps": [
            {"step": 1, "node": "water", "action": cascade["water"]["label"]},
            {"step": 2, "node": "traffic", "action": cascade["traffic"]["label"]},
            {"step": 3, "node": "energy", "action": cascade["energy"]["label"]},
            {"step": 4, "node": "air_quality", "action": cascade["air_quality"]["label"]},
        ],
        **source_badge(DataTier.ESTIMATED, "Simulated cross-system stress propagation"),
    }
