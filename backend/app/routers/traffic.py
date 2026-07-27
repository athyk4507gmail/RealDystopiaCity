from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import traffic

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


class CorridorRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float


class RouteRequest(BaseModel):
    from_road: str
    to_road: str


@router.get("/signals")
def list_signals(db: Session = Depends(get_db)):
    return traffic.get_signals(db)


@router.get("/feed")
def traffic_feed(db: Session = Depends(get_db)):
    return traffic.get_traffic_feed(db)


@router.get("/signals/recommend")
async def signal_recommendations(db: Session = Depends(get_db)):
    return await traffic.get_signal_recommendations(db)


@router.post("/ambulance-corridor")
def ambulance(data: CorridorRequest, db: Session = Depends(get_db)):
    return traffic.ambulance_corridor(db, data.start_lat, data.start_lng, data.end_lat, data.end_lng)


@router.post("/alternative-routes")
def alt_routes(data: RouteRequest, db: Session = Depends(get_db)):
    return traffic.alternative_routes(db, data.from_road, data.to_road)
