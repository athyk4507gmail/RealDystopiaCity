"""Census-grounded ward population projection utilities."""

from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "ward_seed_data.json"
CENSUS_BASE_YEAR = 2011
DEFAULT_GROWTH_RATE = 0.021
DEFAULT_HOUSEHOLD_DIVISOR = 4.7


@lru_cache(maxsize=1)
def load_ward_seed_data() -> dict:
    with DATA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def project_population(
    population_2011: int,
    *,
    target_year: int | None = None,
    growth_rate: float = DEFAULT_GROWTH_RATE,
) -> int:
    year = target_year or date.today().year
    years = max(0, year - CENSUS_BASE_YEAR)
    return round(population_2011 * (1 + growth_rate) ** years)


def project_households(population: int, household_divisor: float = DEFAULT_HOUSEHOLD_DIVISOR) -> int:
    return round(population / household_divisor)


def get_ward_baseline(name: str) -> dict | None:
    data = load_ward_seed_data()
    growth_rate = float(data.get("annual_growth_rate", DEFAULT_GROWTH_RATE))
    household_divisor = float(data.get("household_divisor", DEFAULT_HOUSEHOLD_DIVISOR))
    for ward in data.get("wards", []):
        if ward["name"].lower() == name.lower():
            pop_2011 = int(ward["population_2011"])
            population = project_population(pop_2011, growth_rate=growth_rate)
            houses = project_households(population, household_divisor)
            return {
                "name": ward["name"],
                "population_2011": pop_2011,
                "area_sq_km": ward["area_sq_km"],
                "population_estimate_2026": population,
                "houses": houses,
                "lat": ward.get("lat"),
                "lng": ward.get("lng"),
                "polygon": ward.get("polygon"),
                "zone": ward.get("zone"),
            }
    return None


def get_all_ward_baselines() -> dict[str, dict]:
    data = load_ward_seed_data()
    return {
        ward["name"]: get_ward_baseline(ward["name"])
        for ward in data.get("wards", [])
        if get_ward_baseline(ward["name"])
    }
