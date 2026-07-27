from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import traffic_mood

router = APIRouter(prefix="/api/traffic-mood", tags=["traffic-mood"])


@router.get("/events")
async def list_events(db: Session = Depends(get_db)):
    return await traffic_mood.get_events(db)


@router.get("/predict")
async def predict(db: Session = Depends(get_db)):
    return await traffic_mood.predict_surges(db)


@router.post("/trigger/{event_id}")
async def trigger(event_id: int, db: Session = Depends(get_db)):
    return await traffic_mood.trigger_event(db, event_id)
