from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import trust_score

router = APIRouter(prefix="/api/trust-score", tags=["trust-score"])


class RouteReport(BaseModel):
    route_id: int
    on_time: bool


class CommuteRequest(BaseModel):
    origin: str
    destination: str
    time_slot: str = "8AM"


@router.get("/routes")
async def list_routes(time_slot: str | None = None, db: Session = Depends(get_db)):
    return await trust_score.get_routes(db, time_slot)


@router.post("/recommend")
async def recommend(data: CommuteRequest, db: Session = Depends(get_db)):
    return await trust_score.get_recommendation(db, data.origin, data.destination, data.time_slot)


@router.post("/report")
def report(data: RouteReport, db: Session = Depends(get_db)):
    return trust_score.report_route(db, data.route_id, data.on_time)
