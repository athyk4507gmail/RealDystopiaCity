from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import settings
from app.services.canonical_locations import get_locations_payload
from app.services.data_sources import DataTier, source_badge

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/forecast"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TOMTOM_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

_weather_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}


def _cache_key(lat: float, lng: float) -> str:
    return f"{lat:.4f},{lng:.4f}"


def _is_fresh(ts: datetime, minutes: int) -> bool:
    return datetime.now(timezone.utc) - ts < timedelta(minutes=minutes)


async def get_weather(lat: float, lng: float) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    key = _cache_key(lat, lng)
    cached = _weather_cache.get(key)
    if cached and _is_fresh(cached[0], 15):
        payload = dict(cached[1])
        payload["cached"] = True
        return payload

    if not settings.openweather_api_key:
        return {
            "lat": lat,
            "lng": lng,
            "current": None,
            "forecast_48h": [],
            "cached": False,
            **source_badge(DataTier.ESTIMATED, "OpenWeatherMap key missing; returning empty weather payload"),
        }

    params = {"lat": lat, "lon": lng, "appid": settings.openweather_api_key, "units": "metric"}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(OPENWEATHER_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    items = data.get("list", [])
    current = items[0] if items else {}
    forecast_48h = items[:16]

    payload = {
        "lat": lat,
        "lng": lng,
        "current": {
            "temperature_c": current.get("main", {}).get("temp"),
            "humidity_pct": current.get("main", {}).get("humidity"),
            "rain_probability": current.get("pop", 0),
            "summary": (current.get("weather") or [{}])[0].get("description"),
            "timestamp": current.get("dt_txt"),
        },
        "forecast_48h": [
            {
                "timestamp": x.get("dt_txt"),
                "temperature_c": x.get("main", {}).get("temp"),
                "humidity_pct": x.get("main", {}).get("humidity"),
                "rain_probability": x.get("pop", 0),
            }
            for x in forecast_48h
        ],
        "cached": False,
        **source_badge(DataTier.LIVE, "OpenWeatherMap"),
    }
    _weather_cache[key] = (now, payload)
    return payload


async def get_city_locations(city_name: str | None = None) -> dict[str, Any]:
    city = city_name or settings.demo_city_name
    query = f"""
    [out:json][timeout:30];
    area["name"="{city}"]["boundary"="administrative"]->.searchArea;
    (
      relation["boundary"="administrative"]["admin_level"~"8|9"](area.searchArea);
      way["highway"~"primary|secondary|trunk"](area.searchArea);
    );
    out geom;
    """

    try:
        async with httpx.AsyncClient(timeout=35) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        return get_locations_payload(city)

    wards = []
    roads = []
    for item in raw.get("elements", []):
        tags = item.get("tags", {})
        name = tags.get("name")
        geom = item.get("geometry", [])
        if not name or not geom:
            continue
        coords = [[p["lon"], p["lat"]] for p in geom]
        if item.get("type") == "relation":
            wards.append({"name": name, "coordinates": coords})
        elif item.get("type") == "way":
            roads.append({"name": name, "coordinates": coords})

    if not wards and not roads:
        return get_locations_payload(city)

    return {
        "city": city,
        "wards": wards,
        "roads": roads,
        **source_badge(DataTier.LIVE, "OpenStreetMap Overpass"),
    }


async def get_live_traffic(lat: float, lng: float) -> dict[str, Any]:
    if not settings.tomtom_api_key:
        return {
            "lat": lat,
            "lng": lng,
            "congestion_pct": None,
            **source_badge(DataTier.ESTIMATED, "TomTom key missing; live congestion unavailable"),
        }

    params = {"point": f"{lat},{lng}", "key": settings.tomtom_api_key}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(TOMTOM_FLOW_URL, params=params)
        resp.raise_for_status()
        data = resp.json().get("flowSegmentData", {})

    current_speed = data.get("currentSpeed")
    free_flow = data.get("freeFlowSpeed") or 1
    congestion = 100 - min(100, (current_speed / free_flow) * 100) if current_speed is not None else None

    return {
        "lat": lat,
        "lng": lng,
        "current_speed_kmh": current_speed,
        "free_flow_speed_kmh": free_flow,
        "congestion_pct": round(congestion, 1) if congestion is not None else None,
        **source_badge(DataTier.LIVE, "TomTom Traffic"),
    }
