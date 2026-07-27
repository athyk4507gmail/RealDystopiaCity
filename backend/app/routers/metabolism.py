from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import metabolism

router = APIRouter(prefix="/api/metabolism", tags=["metabolism"])


@router.get("/vitals")
async def vitals(db: Session = Depends(get_db)):
    return await metabolism.get_vital_signs(db)


@router.post("/stress-test/{event_type}")
async def stress_test(event_type: str, db: Session = Depends(get_db)):
    return await metabolism.run_stress_test(db, event_type)
