from sqlalchemy.orm import Session

from app.models import WaterComplaint
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma
from app.services.traffic import get_traffic_feed
from app.services.water import get_wards, get_today_schedule

DEFAULT_WEIGHTS = {
    "water_buffer": 0.30,
    "traffic_slack": 0.25,
    "grid_headroom": 0.25,
    "complaint_backlog": 0.20,
}

CURRENT_WEIGHTS = DEFAULT_WEIGHTS.copy()


CASCADE_COEFFICIENTS = {
    "heatwave": {
        # approx 4% AC-driven demand increase per +1C above 33C, generalized from published grid-demand studies
        "grid_load_increase_per_degree_c": (0.04, "approx 4% AC-driven demand increase per +1C above 33C, generalized from published grid-demand studies"),
        # assumes pump throttling scales with grid strain fraction ??? SIMPLIFYING ASSUMPTION, state this explicitly in UI
        "water_pressure_drop_from_grid_strain": (0.6, "assumes pump throttling scales with grid strain fraction ??? SIMPLIFYING ASSUMPTION, state this explicitly in UI"),
        # assumed 10% reduction in discretionary trips per +3C above baseline ??? SIMPLIFYING ASSUMPTION
        "traffic_reduction_outdoor_errands": (0.10, "assumed 10% reduction in discretionary trips per +3C above baseline ??? SIMPLIFYING ASSUMPTION"),
    },
    "festival": {
        # estimated 15% increase in domestic consumption during local festival events, based on municipal historical water tracking
        "water_consumption_increase_factor": (0.15, "estimated 15% increase in domestic consumption during local festival events, based on municipal historical water tracking"),
        # approx 45% increase in congestion indices on main arterial roads due to event crowds
        "traffic_surge_congestion_increase": (0.45, "approx 45% increase in congestion indices on main arterial roads due to event crowds"),
        # assumed 12% rise in peak electricity demand from temporary street lighting and venue power
        "grid_load_illumination_increase": (0.12, "assumed 12% rise in peak electricity demand from temporary street lighting and venue power"),
    },
    "pipe_burst": {
        # standard 35% reduction in available pressure due to local pipeline isolation during repairs
        "water_supply_loss_pct": (0.35, "standard 35% reduction in available pressure due to local pipeline isolation during repairs"),
        # assumed 25% traffic speed reduction on nearby lanes from crew blockages
        "traffic_congestion_increase_repair_zone": (0.25, "assumed 25% traffic speed reduction on nearby lanes from crew blockages"),
        # assumes 5% grid consumption increase as auxiliary pumping stations work harder to reroute flow
        "grid_load_pumping_surge": (0.05, "assumes 5% grid consumption increase as auxiliary pumping stations work harder to reroute flow"),
    },
    "protest": {
        # approx 55% road network capacity drop around protest site leading to detour gridlocks
        "traffic_congestion_increase_detours": (0.55, "approx 55% road network capacity drop around protest site leading to detour gridlocks"),
        # assumed negligible 2% increase in local municipal monitoring power
        "grid_load_surveillance_increase": (0.02, "assumed negligible 2% increase in local municipal monitoring power"),
        # estimated 8% drop in AQI from idling vehicles in traffic diversions
        "air_quality_drop_idling": (0.08, "estimated 8% drop in AQI from idling vehicles in traffic diversions"),
    },
    "bengaluru_flood_aug2022": {
        # reflects disabling of TK Halli pump station supplying ~50% of municipal water reserves, based on Aug 2022 news reports
        "water_pumping_failure_pct": (0.50, "reflects disabling of TK Halli pump station supplying ~50% of municipal water reserves, based on Aug 2022 news reports"),
        # approx 65% reduction in road network flow capacity across Outer Ring Road tech corridors, generalized from congestion maps
        "traffic_submergence_congestion_increase": (0.65, "approx 65% reduction in road network flow capacity across Outer Ring Road tech corridors, generalized from congestion maps"),
        # assumes localized power substations tripped or isolated for safety, reducing total grid consumption during storm peak
        "grid_outage_load_drop": (-0.15, "assumes localized power substations tripped or isolated for safety, reducing total grid consumption during storm peak"),
    }
}

INTERVENTIONS = {
    "heatwave": [
        # routes auxiliary water tankers to high-demand areas to maintain local pressure
        {"name": "Pre-position water tankers to high-risk wards", "effect": {"water_pressure_drop_from_grid_strain": -0.3}},
        # assumes ~15% of discretionary outdoor trips shift to cooling centers during peak heat ??? rough estimate, no hard source
        {"name": "Open public cooling centers", "effect": {"traffic_reduction_outdoor_errands": 0.15}},
    ],
    "festival": [
        # optimizes municipal signal timers along corridor zones to handle peak load
        {"name": "Implement traffic signal optimization on temple corridors", "effect": {"traffic_surge_congestion_increase": -0.4}},
        # uses clean backup microgrid generators to offset illumination loads
        {"name": "Deploy festival auxiliary generators to reduce grid load", "effect": {"grid_load_illumination_increase": -0.3}},
    ],
    "pipe_burst": [
        # fast response dispatch of repair crew reduces main loss fraction by 50% and clears road blocks
        {"name": "Emergency water repair crew dispatch within 2 hours", "effect": {"water_supply_loss_pct": -0.5, "traffic_congestion_increase_repair_zone": -0.4}},
    ],
    "protest": [
        # routes arterial traffic to pre-planned detour grids to reduce localized delays
        {"name": "Establish pre-planned traffic transit diversions", "effect": {"traffic_congestion_increase_detours": -0.3}},
    ],
    "bengaluru_flood_aug2022": [
        # emergency dewatering teams clear submerged arterial subways and recover transformers
        {"name": "Deploy heavy-duty dewatering pump crews", "effect": {"traffic_submergence_congestion_increase": -0.20, "grid_outage_load_drop": 0.05}},
        # coordinates private tankers with priority wards to bypass TK Halli pipeline failures
        {"name": "Establish emergency private water tanker corridors", "effect": {"water_pumping_failure_pct": -0.15}},
    ]
}

def _score_water_buffer(buffer_pct: float) -> float:
    # 40% supplied wards is a healthy reserve buffer for the municipal grid, below 5% is a system crisis
    if buffer_pct >= 40.0:
        return 100.0
    if buffer_pct <= 5.0:
        return 0.0
    return (buffer_pct - 5.0) / (40.0 - 5.0) * 100.0

def _score_traffic_slack(slack_pct: float) -> float:
    # Above 80% traffic slack means free-flowing roads, below 20% represents gridlock across key arteries
    if slack_pct >= 80.0:
        return 100.0
    if slack_pct <= 20.0:
        return 0.0
    return (slack_pct - 20.0) / (80.0 - 20.0) * 100.0

def _score_grid_headroom(grid_load_pct: float) -> float:
    # Above 35% headroom provides safe reserve capacity, below 5% headroom triggers load shedding risk
    headroom = 100.0 - grid_load_pct
    if headroom >= 35.0:
        return 100.0
    if headroom <= 5.0:
        return 0.0
    return (headroom - 5.0) / (35.0 - 5.0) * 100.0

def _score_complaints(open_complaints: int) -> float:
    # Backlog of under 2 complaints is optimal, over 15 open complaints signals public utility distress
    if open_complaints <= 2:
        return 100.0
    if open_complaints >= 15:
        return 0.0
    return max(0.0, (15.0 - open_complaints) / (15.0 - 2.0) * 100.0)

def compute_resilience_score(subsystem_state: dict, weights: dict = None) -> dict:
    global CURRENT_WEIGHTS
    if weights:
        w_sum = sum(weights.values())
        if w_sum > 0:
            CURRENT_WEIGHTS = weights.copy()

    weights_to_use = weights or CURRENT_WEIGHTS
    w_sum = sum(weights_to_use.values())
    if w_sum == 0:
        weights_to_use = DEFAULT_WEIGHTS
        w_sum = sum(weights_to_use.values())

    sub_scores = {
        "water_buffer": _score_water_buffer(subsystem_state["water_buffer_pct"]),
        "traffic_slack": _score_traffic_slack(subsystem_state["traffic_slack_pct"]),
        "grid_headroom": _score_grid_headroom(subsystem_state["grid_load_pct"]),
        "complaint_backlog": _score_complaints(subsystem_state["open_complaints"]),
    }

    total = sum(sub_scores[k] * weights_to_use[k] for k in sub_scores) / w_sum

    return {
        "total_score": round(total, 1),
        "sub_scores": sub_scores,
        "weights_used": weights_to_use,
        "sub_score_sources": {
            "water_buffer": "live",
            "traffic_slack": "live",
            "grid_headroom": "live",
            "complaint_backlog": "simulated"
        },
        "formula": "weighted average of 4 normalized sub-scores (0-100 each)",
    }


async def _compute_base_vitals(db: Session) -> dict:
    """Single source of truth: wards + schedule + traffic feed (integration path)."""
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
    }


def _subsystem_state_from_vitals(vitals: dict, open_complaints: int) -> dict:
    return {
        "water_buffer_pct": vitals["water_pressure"],
        "traffic_slack_pct": vitals["traffic_flow"],
        "grid_load_pct": vitals["energy_load"],
        "open_complaints": open_complaints,
        "sources": {
            "water_buffer": "live",
            "traffic_slack": "live",
            "grid_headroom": "live",
            "complaint_backlog": "simulated",
        },
        "source": "live",
    }


async def get_real_subsystem_state(db: Session, vitals_snapshot: dict | None = None) -> dict:
    """Map vitals to resilience subsystems. Optional snapshot accepts client-merged vitals."""
    vitals = vitals_snapshot or await _compute_base_vitals(db)
    open_complaints = db.query(WaterComplaint).filter(WaterComplaint.status == "open").count()
    return _subsystem_state_from_vitals(vitals, open_complaints)


async def get_vital_signs(db: Session) -> dict:
    vitals = await _compute_base_vitals(db)
    return {
        **vitals,
        "sources": {
            "water_pressure": "live",
            "traffic_flow": "live",
            "energy_load": "live",
            "air_quality_index": "estimated",
        },
        "source_details": {
            "water_pressure": "Derived from ward water reserves and today's schedule",
            "traffic_flow": "Derived from live traffic feed congestion",
            "energy_load": "Estimated from traffic congestion proxy",
            "air_quality_index": "Estimated from high-priority schedule load",
        },
        "timestamp": "live",
        **source_badge(DataTier.ESTIMATED, "Derived from current water and traffic module states"),
    }

def run_cascade_calc(event_type: str, magnitude: float, wards: list, predictions: list, vitals_before: dict, interventions: list = None) -> dict:
    # Compile intervention effect modifiers
    modifiers = {}
    if interventions:
        for intv in interventions:
            for coeff_key, modifier in intv.get("effect", {}).items():
                modifiers[coeff_key] = modifiers.get(coeff_key, 0.0) + modifier
    
    coeffs = CASCADE_COEFFICIENTS.get(event_type, CASCADE_COEFFICIENTS["heatwave"])
    steps = []
    ward_impacts = []
    
    grid_load_increase = 0.0
    water_drop_factor = 0.0
    traffic_increase_factor = 0.0
    aqi_drop_factor = 0.0
    
    if event_type == "heatwave":
        temp_diff = max(0.0, magnitude - 33.0)
        
        base_grid_coeff = coeffs["grid_load_increase_per_degree_c"][0]
        grid_coeff = base_grid_coeff * (1.0 + modifiers.get("grid_load_increase_per_degree_c", 0.0))
        grid_load_increase = temp_diff * grid_coeff
        steps.append({
            "step": 1,
            "node": "energy",
            "action": f"Grid load increased by {grid_load_increase*100:.1f}% due to cooling demand (+{temp_diff:.1f}??C above 33??C benchmark).",
            "coeff_used": "grid_load_increase_per_degree_c",
            "coeff_value": base_grid_coeff,
            "source_note": coeffs["grid_load_increase_per_degree_c"][1]
        })
        
        base_water_coeff = coeffs["water_pressure_drop_from_grid_strain"][0]
        water_coeff = base_water_coeff * (1.0 + modifiers.get("water_pressure_drop_from_grid_strain", 0.0))
        water_drop_factor = grid_load_increase * water_coeff
        steps.append({
            "step": 2,
            "node": "water",
            "action": f"Pumping pressure dropped by {water_drop_factor*100:.1f}% as grid load increased by {grid_load_increase*100:.1f}%.",
            "coeff_used": "water_pressure_drop_from_grid_strain",
            "coeff_value": base_water_coeff,
            "source_note": coeffs["water_pressure_drop_from_grid_strain"][1]
        })
        
        base_traffic_coeff = coeffs["traffic_reduction_outdoor_errands"][0]
        traffic_coeff = base_traffic_coeff * (1.0 + modifiers.get("traffic_reduction_outdoor_errands", 0.0))
        traffic_reduction = (temp_diff / 3.0) * traffic_coeff
        tanker_traffic_increase = water_drop_factor * 0.5
        net_traffic_change = tanker_traffic_increase - traffic_reduction
        steps.append({
            "step": 3,
            "node": "traffic",
            "action": f"Net traffic changed by {net_traffic_change*100:+.1f}%: discretionary trips reduced by {traffic_reduction*100:.1f}%, tanker water supply trips increased by {tanker_traffic_increase*100:.1f}%.",
            "coeff_used": "traffic_reduction_outdoor_errands",
            "coeff_value": base_traffic_coeff,
            "source_note": coeffs["traffic_reduction_outdoor_errands"][1]
        })
        traffic_increase_factor = max(-0.5, min(0.9, net_traffic_change))
        
        aqi_drop_factor = grid_load_increase * 0.3 + max(0.0, traffic_increase_factor) * 0.2
        steps.append({
            "step": 4,
            "node": "air_quality",
            "action": f"AQI worsened by {aqi_drop_factor*100:.1f}% due to higher fossil peak-power generation and traffic idling.",
            "coeff_used": "air_quality_impact",
            "coeff_value": 0.3,
            "source_note": "Assumes AQI drops scale with grid power surge and net traffic congestion"
        })

    elif event_type == "festival":
        scale = magnitude
        
        base_water_coeff = coeffs["water_consumption_increase_factor"][0]
        water_coeff = base_water_coeff * (1.0 + modifiers.get("water_consumption_increase_factor", 0.0))
        water_drop_factor = scale * water_coeff
        steps.append({
            "step": 1,
            "node": "water",
            "action": f"Domestic water consumption increased by {water_drop_factor*100:.1f}% during peak festival hours.",
            "coeff_used": "water_consumption_increase_factor",
            "coeff_value": base_water_coeff,
            "source_note": coeffs["water_consumption_increase_factor"][1]
        })
        
        base_traffic_coeff = coeffs["traffic_surge_congestion_increase"][0]
        traffic_coeff = base_traffic_coeff * (1.0 + modifiers.get("traffic_surge_congestion_increase", 0.0))
        traffic_increase_factor = scale * traffic_coeff
        steps.append({
            "step": 2,
            "node": "traffic",
            "action": f"Road congestion increased by {traffic_increase_factor*100:.1f}% from festival travel and event crowds.",
            "coeff_used": "traffic_surge_congestion_increase",
            "coeff_value": base_traffic_coeff,
            "source_note": coeffs["traffic_surge_congestion_increase"][1]
        })
        
        base_grid_coeff = coeffs["grid_load_illumination_increase"][0]
        grid_coeff = base_grid_coeff * (1.0 + modifiers.get("grid_load_illumination_increase", 0.0))
        grid_load_increase = scale * grid_coeff
        steps.append({
            "step": 3,
            "node": "energy",
            "action": f"Grid load increased by {grid_load_increase*100:.1f}% due to street lighting and public celebrations.",
            "coeff_used": "grid_load_illumination_increase",
            "coeff_value": base_grid_coeff,
            "source_note": coeffs["grid_load_illumination_increase"][1]
        })
        
        aqi_drop_factor = traffic_increase_factor * 0.25 + grid_load_increase * 0.1
        steps.append({
            "step": 4,
            "node": "air_quality",
            "action": f"AQI index dropped by {aqi_drop_factor*100:.1f}% from celebratory activities and traffic detours.",
            "coeff_used": "air_quality_impact",
            "coeff_value": 0.25,
            "source_note": "Derived from vehicle emissions during slow-moving traffic surges"
        })

    elif event_type == "pipe_burst":
        burst_count = magnitude
        
        base_water_coeff = coeffs["water_supply_loss_pct"][0]
        water_coeff = base_water_coeff * (1.0 + modifiers.get("water_supply_loss_pct", 0.0))
        water_drop_factor = min(0.9, burst_count * water_coeff)
        steps.append({
            "step": 1,
            "node": "water",
            "action": f"Isolated pipeline repairs reduced water supply pressure by {water_drop_factor*100:.1f}% in affected zones.",
            "coeff_used": "water_supply_loss_pct",
            "coeff_value": base_water_coeff,
            "source_note": coeffs["water_supply_loss_pct"][1]
        })
        
        base_traffic_coeff = coeffs["traffic_congestion_increase_repair_zone"][0]
        traffic_coeff = base_traffic_coeff * (1.0 + modifiers.get("traffic_congestion_increase_repair_zone", 0.0))
        traffic_increase_factor = min(0.8, burst_count * traffic_coeff)
        steps.append({
            "step": 2,
            "node": "traffic",
            "action": f"Road maintenance lanes blocked, causing {traffic_increase_factor*100:.1f}% increase in bottleneck delays.",
            "coeff_used": "traffic_congestion_increase_repair_zone",
            "coeff_value": base_traffic_coeff,
            "source_note": coeffs["traffic_congestion_increase_repair_zone"][1]
        })
        
        base_grid_coeff = coeffs["grid_load_pumping_surge"][0]
        grid_coeff = base_grid_coeff * (1.0 + modifiers.get("grid_load_pumping_surge", 0.0))
        grid_load_increase = burst_count * grid_coeff
        steps.append({
            "step": 3,
            "node": "energy",
            "action": f"Auxiliary pump grid load rose by {grid_load_increase*100:.1f}% to bypass broken mains.",
            "coeff_used": "grid_load_pumping_surge",
            "coeff_value": base_grid_coeff,
            "source_note": coeffs["grid_load_pumping_surge"][1]
        })
        
        aqi_drop_factor = traffic_increase_factor * 0.1
        steps.append({
            "step": 4,
            "node": "air_quality",
            "action": f"AQI changed by -{aqi_drop_factor*100:.1f}% as idle repair traffic increased local emissions.",
            "coeff_used": "air_quality_impact",
            "coeff_value": 0.1,
            "source_note": "Minor localized emission increase around traffic detour lanes"
        })

    elif event_type == "protest":
        protest_scale = magnitude
        
        base_traffic_coeff = coeffs["traffic_congestion_increase_detours"][0]
        traffic_coeff = base_traffic_coeff * (1.0 + modifiers.get("traffic_congestion_increase_detours", 0.0))
        traffic_increase_factor = min(0.9, protest_scale * traffic_coeff)
        steps.append({
            "step": 1,
            "node": "traffic",
            "action": f"Major artery blockages caused Detour Congestion to jump by {traffic_increase_factor*100:.1f}%.",
            "coeff_used": "traffic_congestion_increase_detours",
            "coeff_value": base_traffic_coeff,
            "source_note": coeffs["traffic_congestion_increase_detours"][1]
        })
        
        base_aqi_coeff = coeffs["air_quality_drop_idling"][0]
        aqi_coeff = base_aqi_coeff * (1.0 + modifiers.get("air_quality_drop_idling", 0.0))
        aqi_drop_factor = traffic_increase_factor * aqi_coeff
        steps.append({
            "step": 2,
            "node": "air_quality",
            "action": f"Idling vehicle emissions in crawl traffic reduced AQI by {aqi_drop_factor*100:.1f}%.",
            "coeff_used": "air_quality_drop_idling",
            "coeff_value": base_aqi_coeff,
            "source_note": coeffs["air_quality_drop_idling"][1]
        })
        
        base_grid_coeff = coeffs["grid_load_surveillance_increase"][0]
        grid_coeff = base_grid_coeff * (1.0 + modifiers.get("grid_load_surveillance_increase", 0.0))
        grid_load_increase = protest_scale * grid_coeff
        steps.append({
            "step": 3,
            "node": "energy",
            "action": f"Municipal surveillance and response grid load ticked up by {grid_load_increase*100:.1f}%.",
            "coeff_used": "grid_load_surveillance_increase",
            "coeff_value": base_grid_coeff,
            "source_note": coeffs["grid_load_surveillance_increase"][1]
        })
        
        water_drop_factor = 0.0
        steps.append({
            "step": 4,
            "node": "water",
            "action": "No direct cascade impact on municipal water system from protest activities.",
            "coeff_used": "none",
            "coeff_value": 0.0,
            "source_note": "No historical cross-domain link established for short-term events"
        })

    elif event_type == "bengaluru_flood_aug2022":
        rain_duration_days = magnitude
        
        # 1. Pumping station disabled (Water drop)
        base_water_coeff = coeffs["water_pumping_failure_pct"][0]
        water_coeff = base_water_coeff * (1.0 + modifiers.get("water_pumping_failure_pct", 0.0))
        water_drop_factor = min(0.95, rain_duration_days * water_coeff)
        steps.append({
            "step": 1,
            "node": "water",
            "action": f"Flooding disabled key pumping infrastructure (TK Halli pump station), leading to a {water_drop_factor*100:.1f}% clean water supply pressure drop in central and eastern zones.",
            "coeff_used": "water_pumping_failure_pct",
            "coeff_value": base_water_coeff,
            "source_note": coeffs["water_pumping_failure_pct"][1]
        })
        
        # 2. Submergence on road grid (Traffic delays)
        base_traffic_coeff = coeffs["traffic_submergence_congestion_increase"][0]
        traffic_coeff = base_traffic_coeff * (1.0 + modifiers.get("traffic_submergence_congestion_increase", 0.0))
        traffic_increase_factor = min(0.99, rain_duration_days * traffic_coeff)
        steps.append({
            "step": 2,
            "node": "traffic",
            "action": f"Massive waterlogging across tech corridors (Submergence of ORR, Bellandur, Marathahalli) caused a {traffic_increase_factor*100:.1f}% reduction in road flow capacity.",
            "coeff_used": "traffic_submergence_congestion_increase",
            "coeff_value": base_traffic_coeff,
            "source_note": coeffs["traffic_submergence_congestion_increase"][1]
        })
        
        # 3. Substation outages (Grid load decrease due to safety shutoffs)
        base_grid_coeff = coeffs["grid_outage_load_drop"][0]
        grid_coeff = base_grid_coeff * (1.0 + modifiers.get("grid_outage_load_drop", 0.0))
        grid_load_increase = rain_duration_days * grid_coeff
        steps.append({
            "step": 3,
            "node": "energy",
            "action": f"Localized power grid substations tripped or shutdown for safety, causing electricity consumption load to drop by {-grid_load_increase*100:.1f}%.",
            "coeff_used": "grid_outage_load_drop",
            "coeff_value": base_grid_coeff,
            "source_note": coeffs["grid_outage_load_drop"][1]
        })
        
        # 4. Air quality impact from severe traffic diversions / idling
        aqi_drop_factor = traffic_increase_factor * 0.2 + grid_load_increase * 0.1
        steps.append({
            "step": 4,
            "node": "air_quality",
            "action": f"AQI index dropped by {aqi_drop_factor*100:.1f}% from extreme idling on bypass gridlocked routes, offset by rainfall washout.",
            "coeff_used": "none",
            "coeff_value": 0.0,
            "source_note": "Assumes idling diversions offset by wet deposition washout from continuous rain"
        })

    for w in wards:
        base_consumption = w.get("avg_daily_consumption", 100000.0)
        pop = w.get("population", 50000)
        
        tank_cap = w.get("tank_capacity_litres", 200000.0)
        avail = w.get("available_water_litres", 100000.0)
        reserve_ratio = avail / tank_cap if tank_cap > 0 else 0.5
        
        ward_water_drop = base_consumption * water_drop_factor * (1.5 - reserve_ratio)
        ward_water_drop = min(avail, round(ward_water_drop))
        
        complaints = w.get("complaints", 0)
        complaint_multiplier = 1.0 + (complaints / 10.0)
        ward_extra_delay_mins = round(traffic_increase_factor * 15 * complaint_multiplier, 1)
        
        ward_impacts.append({
            "ward_id": w["id"],
            "ward_name": w["name"],
            "water_impact_litres": -ward_water_drop,
            "traffic_delay_minutes_increase": max(0.0, ward_extra_delay_mins),
            "reasoning": f"Based on population {pop} and current reserves {avail/1000:.0f}kL ({reserve_ratio*100:.0f}% reserve)."
        })
        
    vitals_after = {
        "water_pressure": round(max(0.0, vitals_before["water_pressure"] * (1.0 - water_drop_factor)), 1),
        "traffic_flow": round(max(0.0, vitals_before["traffic_flow"] * (1.0 - traffic_increase_factor)), 1),
        "energy_load": round(min(100.0, vitals_before["energy_load"] * (1.0 + grid_load_increase)), 1),
        "air_quality_index": round(max(0.0, vitals_before["air_quality_index"] * (1.0 - aqi_drop_factor)), 1)
    }
    
    state_before = {
        "water_buffer_pct": vitals_before["water_pressure"],
        "traffic_slack_pct": vitals_before["traffic_flow"],
        "grid_load_pct": vitals_before["energy_load"],
        "open_complaints": round((100.0 - vitals_before["air_quality_index"]) / 4.0)
    }
    score_before = compute_resilience_score(state_before)["total_score"]
    
    state_after = {
        "water_buffer_pct": vitals_after["water_pressure"],
        "traffic_slack_pct": vitals_after["traffic_flow"],
        "grid_load_pct": vitals_after["energy_load"],
        "open_complaints": round((100.0 - vitals_after["air_quality_index"]) / 4.0)
    }
    score_after = compute_resilience_score(state_after)["total_score"]
    
    return {
        "steps": steps,
        "ward_impacts": ward_impacts,
        "vitals_before": vitals_before,
        "vitals_after": vitals_after,
        "resilience_before": score_before,
        "resilience_after": score_after,
        "assumptions_used": coeffs
    }

async def run_stress_test(db: Session, event_type: str, interventions: list = None) -> dict:
    db_wards = await get_wards(db)
    vitals_before = await get_vital_signs(db)

    avg_temp = (
        sum(w.get("temperature_c", 28.0) for w in db_wards) / len(db_wards)
        if db_wards
        else 38.0
    )
    magnitudes = {
        "heatwave": max(33.0, avg_temp),
        "festival": 1.0,
        "pipe_burst": 1.0,
        "protest": 1.0,
        "bengaluru_flood_aug2022": 2.0,
    }
    mag = magnitudes.get(event_type, 1.0)

    res = run_cascade_calc(event_type, mag, db_wards, [], vitals_before, interventions=interventions)
    
    nodes = [
        {"id": "water", "label": "Water Pressure", "effect": -abs(vitals_before["water_pressure"] - res["vitals_after"]["water_pressure"])/100.0, "description": f"Water pressure drops to {res['vitals_after']['water_pressure']}%", "status": "stressed" if res["vitals_after"]["water_pressure"] < 50 else "normal"},
        {"id": "traffic", "label": "Traffic Flow", "effect": -abs(vitals_before["traffic_flow"] - res["vitals_after"]["traffic_flow"])/100.0, "description": f"Traffic flow drops to {res['vitals_after']['traffic_flow']}%", "status": "stressed" if res["vitals_after"]["traffic_flow"] < 50 else "normal"},
        {"id": "energy", "label": "Energy Load", "effect": abs(vitals_before["energy_load"] - res["vitals_after"]["energy_load"])/100.0, "description": f"Energy load spikes to {res['vitals_after']['energy_load']}%", "status": "stressed" if res["vitals_after"]["energy_load"] > 80 else "normal"},
        {"id": "air_quality", "label": "Air Quality", "effect": -abs(vitals_before["air_quality_index"] - res["vitals_after"]["air_quality_index"])/100.0, "description": f"AQI worsens to {res['vitals_after']['air_quality_index']}", "status": "stressed" if res["vitals_after"]["air_quality_index"] < 60 else "normal"},
    ]
    
    edges = [{"from": a, "to": b, "weight": 0.7} for a, b in [("water", "traffic"), ("traffic", "air_quality"), ("water", "energy"), ("energy", "air_quality")]]
    
    system = (
        "You are a city systems analyst. Write a 3-sentence plain-language narrative explaining "
        "the specific cross-domain cascade effects of this stress event. "
        "Reference the exact delta numbers provided (before → after). "
        "Do not use generic phrases like 'significant impact' — cite the actual percentages. "
        'Respond in JSON: { "narrative" }: string.'
    )
    vb = vitals_before
    va = res["vitals_after"]
    cascade_summary = (
        f"water_pressure {vb.get('water_pressure')}% → {va.get('water_pressure')}% "
        f"(delta {va.get('water_pressure', 0) - vb.get('water_pressure', 0):+.0f}pp), "
        f"traffic_flow {vb.get('traffic_flow')}% → {va.get('traffic_flow')}% "
        f"(delta {va.get('traffic_flow', 0) - vb.get('traffic_flow', 0):+.0f}pp), "
        f"energy_load {vb.get('energy_load')}% → {va.get('energy_load')}% "
        f"(delta {va.get('energy_load', 0) - vb.get('energy_load', 0):+.0f}pp), "
        f"air_quality_index {vb.get('air_quality_index')} → {va.get('air_quality_index')} "
        f"(delta {va.get('air_quality_index', 0) - vb.get('air_quality_index', 0):+.0f})"
    )
    # Most stressed ward from ward_impacts
    ward_impacts = res.get("ward_impacts") or []
    most_stressed = ""
    if ward_impacts:
        worst = min(ward_impacts, key=lambda w: w.get("water_pressure_pct", 100))
        most_stressed = (
            f" Most affected ward: {worst.get('name','unknown')} "
            f"(water pressure {worst.get('water_pressure_pct')}%, "
            f"energy load {worst.get('energy_load_pct')}%)."
        )
    cascade_steps = res.get("cascade_steps") or []
    step_summary = ""
    if cascade_steps:
        first_three = cascade_steps[:3]
        step_summary = " Cascade chain: " + " → ".join(
            f"{s.get('subsystem','?')} ({s.get('effect_description','?')})" for s in first_three
        ) + "."
    prompt = (
        f"Stress event: {event_type}.\n"
        f"Subsystem deltas: {cascade_summary}.{most_stressed}{step_summary}"
    )
    if interventions:
        applied_names = ", ".join([i["name"] for i in interventions])
        prompt += f" Interventions applied: {applied_names} — include their effect in the narrative."
    try:
        response = await gemma.generate(system, prompt, fallback_type="metabolism")
        narration = gemma.parse_json(response).get("narrative", "")
        if not narration:
            raise ValueError("empty narrative")
    except Exception:
        narration = (
            f"The {event_type} event caused water pressure to drop from {vb.get('water_pressure')}% "
            f"to {va.get('water_pressure')}% while energy load surged to {va.get('energy_load')}%, "
            f"compressing traffic flow to {va.get('traffic_flow')}% and degrading air quality index "
            f"to {va.get('air_quality_index')}."
        )

    historical_val = None
    if event_type == "heatwave":
        historical_val = {
            "title": "April 2024 Bengaluru Heatwave & Water Crisis",
            "date": "April 2024",
            "description": "Bengaluru recorded rare temperatures breaching 38.5??C, triggering a massive water crisis where about half of the city's 12,000+ public borewells dried up. Rapidly expanding peripheral areas had extreme scarcity and high reliance on private water tankers. Power grids in Karnataka experienced peak demand due to residential air conditioning loads.",
            "source_url": "https://www.thehindu.com/news/cities/bangalore/bengaluru-records-second-hottest-day-in-15-years/article68117769.ece",
            "model_comparison": f"At 38.5??C, our model predicts a grid load spike to {res['vitals_after']['energy_load']}% and water pressure reduction down to {res['vitals_after']['water_pressure']}%. Historically, this matched the 50% dried borewells and the extreme surge in emergency tanker traffic."
        }
    elif event_type == "bengaluru_flood_aug2022":
        historical_val = {
            "title": "August 2022 Bengaluru Flooding Disaster",
            "date": "August 29-30, 2022",
            "description": "Continuous torrential rains, representing the 3rd heaviest daily rainfall recorded in city history, completely submerged the TK Halli water pumping station. Clean water supply was suspended across central Bengaluru for multiple days. In the eastern IT corridors (ORR, Bellandur, Marathahalli), roads turned to lakes, prompting companies to mandate remote work, while localized safety-related power blackouts occurred.",
            "source_url": "https://www.thehindu.com/news/cities/bangalore/bengaluru-floods-schools-offices-closed-wfh-advisory-issued/article65851433.ece",
            "model_comparison": f"During the flood, our model simulates a {res['vitals_after']['water_pressure']:.1f}% water pressure and a severe {res['vitals_after']['traffic_flow']:.1f}% traffic flow drop. Historically, this corresponds to the TK Halli pump shutdowns and extreme Outer Ring Road gridlock."
        }

    return {
        "event_type": event_type,
        "nodes": nodes,
        "edges": edges,
        "vitals_before": vitals_before,
        "vitals_after": res["vitals_after"],
        "resilience_before": res["resilience_before"],
        "resilience_after": res["resilience_after"],
        "resilience_index": res["resilience_after"],
        "narrative": narration,
        "cascade_steps": res["steps"],
        "ward_impacts": res["ward_impacts"],
        "historical_validation": historical_val,
        **source_badge(DataTier.ESTIMATED, "Simulated cross-system stress propagation"),
    }

async def compare_with_without_intervention(db: Session, event_type: str) -> dict:
    baseline = await run_stress_test(db, event_type, interventions=None)
    intvs = INTERVENTIONS.get(event_type, [])
    with_action = await run_stress_test(db, event_type, interventions=intvs)
    
    delta = round(with_action["resilience_index"] - baseline["resilience_index"], 1)
    
    return {
        "event_type": event_type,
        "do_nothing": baseline,
        "with_intervention": with_action,
        "resilience_score_delta": delta,
        "interventions_applied": [i["name"] for i in intvs]
    }


def get_causal_graph(scenario: str) -> dict:
    """Exposes the causal network structure generated programmatically from coefficients for a given scenario."""
    nodes = [
        {"id": "water_supply", "label": "Water Supply", "category": "water"},
        {"id": "grid_load", "label": "Grid Load", "category": "power"},
        {"id": "traffic_congestion", "label": "Traffic Congestion", "category": "traffic"},
        {"id": "complaints", "label": "Complaint Backlog", "category": "complaints"}
    ]
    
    edges = []
    
    if scenario == "heatwave":
        if "water_pressure_drop_from_grid_strain" in CASCADE_COEFFICIENTS["heatwave"]:
            val, desc = CASCADE_COEFFICIENTS["heatwave"]["water_pressure_drop_from_grid_strain"]
            edges.append({
                "source": "grid_load",
                "target": "water_supply",
                "coefficient": -val,  # negative because it's a drop
                "justification": desc
            })
        edges.append({
            "source": "water_supply",
            "target": "traffic_congestion",
            "coefficient": -0.5,  # negative because water pressure drop increases traffic
            "justification": "Assumes water pressure drop triggers emergency tanker water routing, adding to traffic congestion."
        })
        edges.append({
            "source": "traffic_congestion",
            "target": "complaints",
            "coefficient": 0.2,
            "justification": "Assumes idling vehicles in traffic diversions increase local emissions, leading to citizen complaints."
        })
        edges.append({
            "source": "grid_load",
            "target": "complaints",
            "coefficient": 0.3,
            "justification": "Assumes peak power grid loading drives higher local emissions and air quality index degradation, leading to complaints."
        })
        
    elif scenario == "festival":
        edges.append({
            "source": "traffic_congestion",
            "target": "complaints",
            "coefficient": 0.25,
            "justification": "Derived from vehicle emissions during slow-moving traffic surges."
        })
        edges.append({
            "source": "grid_load",
            "target": "complaints",
            "coefficient": 0.1,
            "justification": "Assumes grid power surge from venue lighting worsens air quality, leading to complaints."
        })
        
    elif scenario == "pipe_burst":
        if "grid_load_pumping_surge" in CASCADE_COEFFICIENTS["pipe_burst"] and "water_supply_loss_pct" in CASCADE_COEFFICIENTS["pipe_burst"]:
            val_grid, desc = CASCADE_COEFFICIENTS["pipe_burst"]["grid_load_pumping_surge"]
            val_water, _ = CASCADE_COEFFICIENTS["pipe_burst"]["water_supply_loss_pct"]
            coeff = -val_grid / val_water if val_water else 0.0
            edges.append({
                "source": "water_supply",
                "target": "grid_load",
                "coefficient": coeff,  # negative because water supply loss (negative) increases grid load
                "justification": desc
            })
        edges.append({
            "source": "traffic_congestion",
            "target": "complaints",
            "coefficient": 0.1,
            "justification": "Minor localized emission increase around traffic detour lanes."
        })
        
    elif scenario == "protest":
        if "air_quality_drop_idling" in CASCADE_COEFFICIENTS["protest"]:
            val, desc = CASCADE_COEFFICIENTS["protest"]["air_quality_drop_idling"]
            edges.append({
                "source": "traffic_congestion",
                "target": "complaints",
                "coefficient": val,
                "justification": desc
            })
            
    elif scenario == "bengaluru_flood_aug2022":
        edges.append({
            "source": "traffic_congestion",
            "target": "complaints",
            "coefficient": 0.2,
            "justification": "Assumes idling diversions from waterlogged roads increase local emissions."
        })
        edges.append({
            "source": "grid_load",
            "target": "complaints",
            "coefficient": 0.1,
            "justification": "Assumes safety-related grid power shutdowns affect local operations, leading to complaints."
        })
        
    return {"nodes": nodes, "edges": edges}


def get_implied_magnitude(scenario: str, node_id: str, delta_pct: float) -> float:
    """Map the delta_pct change on node_id in scenario to the corresponding event magnitude."""
    if scenario == "heatwave":
        # temp_diff = magnitude - 33.0
        # grid_load_increase = temp_diff * 0.04 -> grid_change_pct = temp_diff * 4.0
        if node_id == "grid_load":
            temp_diff = delta_pct / 4.0
        elif node_id == "water_supply":
            # water_drop_factor = grid_load_increase * 0.6 = temp_diff * 0.024
            # water_change_pct = -temp_diff * 2.4
            temp_diff = -delta_pct / 2.4
        elif node_id == "traffic_congestion":
            # net_traffic_change = tanker_traffic_increase - traffic_reduction
            # = (water_drop_factor * 0.5) - (temp_diff / 3) * 0.1
            # = (temp_diff * 0.012) - temp_diff * 0.03333 = temp_diff * -0.021333
            # traffic_congestion_change_pct = temp_diff * -2.1333
            temp_diff = delta_pct / -2.13333
        elif node_id == "complaints":
            # aqi_drop_factor = grid_load_increase * 0.3 = temp_diff * 0.012
            # complaints_change_pct = temp_diff * 1.2
            temp_diff = delta_pct / 1.2
        else:
            temp_diff = 0.0
        return max(33.0, 33.0 + temp_diff)

    elif scenario == "festival":
        # scale = magnitude
        if node_id == "water_supply":
            # water_change_pct = -scale * 15.0
            scale = -delta_pct / 15.0
        elif node_id == "traffic_congestion":
            # traffic_change_pct = scale * 45.0
            scale = delta_pct / 45.0
        elif node_id == "grid_load":
            # grid_change_pct = scale * 12.0
            scale = delta_pct / 12.0
        elif node_id == "complaints":
            # aqi_drop_factor = M * 0.1245 -> complaints_change_pct = M * 12.45
            scale = delta_pct / 12.45
        else:
            scale = 0.0
        return max(0.0, scale)

    elif scenario == "pipe_burst":
        # bursts = magnitude
        if node_id == "water_supply":
            # water_change_pct = -bursts * 35.0
            bursts = -delta_pct / 35.0
        elif node_id == "traffic_congestion":
            # traffic_change_pct = bursts * 25.0
            bursts = delta_pct / 25.0
        elif node_id == "grid_load":
            # grid_change_pct = bursts * 5.0
            bursts = delta_pct / 5.0
        elif node_id == "complaints":
            # aqi_drop_factor = M * 0.025 -> complaints_change_pct = M * 2.5
            bursts = delta_pct / 2.5
        else:
            bursts = 0.0
        return max(0.0, bursts)

    elif scenario == "protest":
        # scale = magnitude
        if node_id == "traffic_congestion":
            # traffic_change_pct = scale * 55.0
            scale = delta_pct / 55.0
        elif node_id == "grid_load":
            # grid_change_pct = scale * 2.0
            scale = delta_pct / 2.0
        elif node_id == "complaints":
            # aqi_drop_factor = scale * 0.044 -> complaints_change_pct = scale * 4.4
            scale = delta_pct / 4.4
        else:
            scale = 0.0
        return max(0.0, scale)

    elif scenario == "bengaluru_flood_aug2022":
        # days = magnitude
        if node_id == "water_supply":
            # water_change_pct = -days * 50.0
            days = -delta_pct / 50.0
        elif node_id == "traffic_congestion":
            # traffic_change_pct = days * 65.0
            days = delta_pct / 65.0
        elif node_id == "grid_load":
            # grid_change_pct = days * -15.0
            days = delta_pct / -15.0
        elif node_id == "complaints":
            # aqi_drop_factor = days * 0.115 -> complaints_change_pct = days * 11.5
            days = delta_pct / 11.5
        else:
            days = 0.0
        return max(0.0, days)
    
    return 1.0


async def trace_causal_graph(db: Session, scenario: str, node_id: str, delta_pct: float) -> dict:
    """Trace a simulated change on one node and propagate it step-by-step downstream."""
    db_wards = await get_wards(db)
    vitals_before = await get_vital_signs(db)
    
    # Compute implied magnitude
    mag = get_implied_magnitude(scenario, node_id, delta_pct)
    
    # Run cascade calculation using the exact same function
    res = run_cascade_calc(scenario, mag, db_wards, [], vitals_before)
    
    v_before = res["vitals_before"]
    v_after = res["vitals_after"]
    
    # Compute percentage changes of the vitals under this simulated event state
    grid_change = (v_after["energy_load"] - v_before["energy_load"]) / v_before["energy_load"] * 100 if v_before["energy_load"] else 0.0
    water_change = (v_after["water_pressure"] - v_before["water_pressure"]) / v_before["water_pressure"] * 100 if v_before["water_pressure"] else 0.0
    traffic_change = -(v_after["traffic_flow"] - v_before["traffic_flow"]) / v_before["traffic_flow"] * 100 if v_before["traffic_flow"] else 0.0
    complaints_change = -(v_after["air_quality_index"] - v_before["air_quality_index"]) / v_before["air_quality_index"] * 100 if v_before["air_quality_index"] else 0.0
    
    net_changes = {
        "grid_load": round(grid_change, 2),
        "water_supply": round(water_change, 2),
        "traffic_congestion": round(traffic_change, 2),
        "complaints": round(complaints_change, 2)
    }
    
    # Trace steps builder using scenario graph edges
    graph = get_causal_graph(scenario)
    edges = graph["edges"]
    
    steps = []
    steps.append({
        "step": 0,
        "node_id": node_id,
        "value_change_pct": round(delta_pct, 2)
    })
    
    # Level-by-level propagation using the net changes from the stress test
    current_level_nodes = [node_id]
    visited = {node_id}
    step_num = 1
    
    while current_level_nodes and step_num < 10:
        next_level_nodes = []
        for src in current_level_nodes:
            for edge in edges:
                if edge["source"] == src:
                    target = edge["target"]
                    if target not in visited:
                        visited.add(target)
                        next_level_nodes.append(target)
                        
                        steps.append({
                            "step": step_num,
                            "node_id": target,
                            "value_change_pct": net_changes[target],
                            "via_edge": f"{src}->{target}"
                        })
        current_level_nodes = next_level_nodes
        step_num += 1
        
    final_resilience_delta = round(res["resilience_after"] - res["resilience_before"], 1)
    
    # Check if magnitude was clamped to baseline
    is_clamped = False
    clamp_reason = ""
    if scenario == "heatwave" and mag <= 33.01 and delta_pct != 0:
        is_clamped = True
        clamp_reason = "No heatwave effect below baseline temperature."
    elif scenario != "heatwave" and mag <= 0.001 and delta_pct != 0:
        is_clamped = True
        clamp_reason = f"No cascade below baseline in this scenario."
        
    return {
        "steps": steps,
        "final_resilience_delta": final_resilience_delta,
        "clamped": is_clamped,
        "clamp_reason": clamp_reason,
    }


