from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import risk_zones

router = APIRouter(prefix="/api/risk-zones", tags=["risk-zones"])


@router.get("/segments")
def list_segments(week: int = 4, db: Session = Depends(get_db)):
    return risk_zones.get_risk_segments(db, week)


@router.get("/timeline")
def timeline(db: Session = Depends(get_db)):
    return risk_zones.get_timeline(db)


@router.get("/black-spots")
def black_spots():
    return risk_zones.get_reported_black_spots()


@router.get("/explain/{segment_id}")
async def explain(segment_id: int, db: Session = Depends(get_db)):
    return await risk_zones.explain_zone(db, segment_id)
