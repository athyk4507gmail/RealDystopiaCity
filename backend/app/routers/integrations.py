from fastapi import APIRouter

from app.services import integrations

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/weather")
async def weather(lat: float, lng: float):
    return await integrations.get_weather(lat, lng)


@router.get("/locations")
async def locations(city: str | None = None):
    return await integrations.get_city_locations(city)


@router.get("/traffic")
async def traffic(lat: float, lng: float):
    return await integrations.get_live_traffic(lat, lng)
