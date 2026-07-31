from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.services.data_sources import DataTier, source_badge

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "bengaluru_canonical.json"


@lru_cache(maxsize=1)
def load_canonical_city() -> dict:
    with DATA_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def get_canonical_wards() -> list[dict]:
    city = load_canonical_city()
    return city.get("wards", [])


def get_canonical_roads() -> list[dict]:
    city = load_canonical_city()
    return city.get("roads", [])


def get_household_size() -> float:
    return float(load_canonical_city().get("household_size", 4.1))


def get_locations_payload(city_name: str | None = None) -> dict:
    city = load_canonical_city()
    return {
        "city": city_name or city.get("city", "Bengaluru"),
        "wards": [
            {
                "name": ward["name"],
                "lat": ward["lat"],
                "lng": ward["lng"],
                "population": ward.get("population"),
                "coordinates": [[ward["lng"], ward["lat"]]],
            }
            for ward in city.get("wards", [])
        ],
        "roads": city.get("roads", []),
        **source_badge(DataTier.REPORTED, "Canonical Bengaluru ward/road anchors (census + OSM names)"),
    }
