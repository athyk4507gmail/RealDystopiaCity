# Define real adjacency between Bengaluru junctions — which junctions are
# "neighbors" of which (edit this to match actual road connectivity)
JUNCTION_ADJACENCY = {
    "silk_board": ["marathahalli", "electronic_city_toll"],
    "marathahalli": ["silk_board", "kr_puram", "sarjapur"],
    "kr_puram": ["marathahalli", "tin_factory"],
    "hebbal": ["mg_road", "trinity_circle"],
    "tin_factory": ["kr_puram"],
    "mg_road": ["hebbal", "trinity_circle"],
    "trinity_circle": ["mg_road", "hebbal"],
    "sarjapur": ["marathahalli"],
    "electronic_city_toll": ["silk_board"],
}

BASE_RED_LIGHT_SECONDS = 30   # equivalent to the original's "2" unit
CONGESTED_RED_LIGHT_SECONDS = 60  # equivalent to the original's "4" unit
CONGESTION_THRESHOLD = 25  # vehicles — tune this per real image test results


def compute_signal_durations(vehicle_counts: dict) -> dict:
    """
    vehicle_counts: {junction_id: vehicle_count}
    Returns: {junction_id: red_light_duration_seconds}
    Same core rule as the original notebook: if a junction is congested,
    its NEIGHBORS get a longer red light (to hold back inflow and let the
    congested junction clear) — congested junction itself keeps base timing.
    """
    durations = {j: BASE_RED_LIGHT_SECONDS for j in vehicle_counts}
    for junction, count in vehicle_counts.items():
        if count >= CONGESTION_THRESHOLD:
            for neighbor in JUNCTION_ADJACENCY.get(junction, []):
                if neighbor in durations:
                    durations[neighbor] = CONGESTED_RED_LIGHT_SECONDS
    return durations
