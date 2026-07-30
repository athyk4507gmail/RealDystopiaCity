BASE_GREEN_SECONDS = 30
MAX_GREEN_SECONDS = 90
MIN_GREEN_SECONDS = 15
VEHICLES_PER_EXTRA_5_SECONDS = 3


def compute_live_signal(vehicle_count: int) -> dict:
    """
    More vehicles detected -> longer green light (more time to clear).
    Fewer vehicles detected -> shorter green / longer relative red.
    Person count is NOT part of this calculation.
    """
    extra_green = min(
        (vehicle_count // VEHICLES_PER_EXTRA_5_SECONDS) * 5,
        MAX_GREEN_SECONDS - BASE_GREEN_SECONDS,
    )
    green_seconds = max(MIN_GREEN_SECONDS, BASE_GREEN_SECONDS + extra_green)
    red_seconds = 60 - green_seconds
    return {
        "vehicle_count": vehicle_count,
        "green_seconds": green_seconds,
        "red_seconds": red_seconds,
        "status": (
            "Heavy"
            if vehicle_count > 20
            else "Moderate"
            if vehicle_count > 8
            else "Light"
        ),
    }
