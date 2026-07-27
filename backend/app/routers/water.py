from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import water
from app.services.gemma import gemma

router = APIRouter(prefix="/api/water", tags=["water"])


class ComplaintCreate(BaseModel):
    ward_id: int
    type: str
    description: str


class SubLocality(BaseModel):
    name: str
    priority_rank: int
    allocation_litres: float


class WaterScheduleResponse(BaseModel):
    ward_id: int
    ward_name: str
    supply_today: bool
    allocation_litres: float
    duration_hours: float
    supply_start_time: str
    supply_end_time: str
    priority: str
    reasoning: str
    sub_localities: list[SubLocality] = Field(default_factory=list)
    source_type: str | None = None
    source_label: str | None = None
    source_detail: str | None = None


class ComplaintResponse(BaseModel):
    id: int
    ward_id: int
    ward_name: str
    type: str
    description: str
    status: str
    created_at: str
    source_type: str | None = None
    source_label: str | None = None
    source_detail: str | None = None


@router.get("/wards")
async def list_wards(db: Session = Depends(get_db)):
    return await water.get_wards(db)


@router.get("/schedule", response_model=list[WaterScheduleResponse])
async def today_schedule(db: Session = Depends(get_db)):
    return await water.get_today_schedule(db)


@router.post("/schedule/generate", response_model=list[WaterScheduleResponse])
async def generate_schedule(db: Session = Depends(get_db)):
    return await water.generate_schedule(db)


@router.get("/demand/{ward_id}")
def demand_prediction(ward_id: int, days: int = 14, db: Session = Depends(get_db)):
    return water.predict_demand(db, ward_id, days)


@router.post("/leakage/detect")
async def detect_leakage(file: UploadFile = File(...)):
    image_bytes = await file.read()
    image_b64 = gemma.encode_image(image_bytes)
    return await water.detect_leakage(image_b64)


@router.post("/complaints")
def create_complaint(data: ComplaintCreate, db: Session = Depends(get_db)):
    return water.create_complaint(db, data.ward_id, data.type, data.description)


@router.get("/complaints", response_model=list[ComplaintResponse])
def list_complaints(
    ward_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    return water.get_complaints(db, ward_id, status)
