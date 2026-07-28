from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import water
from app.services.gemma import gemma

router = APIRouter(prefix="/api/water", tags=["water"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

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


class TriageRequest(BaseModel):
    description: str
    type: str = "general"


class AnnouncementDraftRequest(BaseModel):
    area: str
    hint: str


class CitizenAskRequest(BaseModel):
    question: str
    ward_context: dict = Field(default_factory=dict)


class InsightsRequest(BaseModel):
    issue_summary: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Existing endpoints — unchanged
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# NEW: AI endpoints — all under /api/water/ai/*
# ---------------------------------------------------------------------------

@router.post("/ai/triage")
async def triage_complaint(data: TriageRequest):
    """AI-powered complaint severity triage + suggested staff response."""
    try:
        return await water.triage_complaint(data.description, data.type)
    except Exception as e:
        return {
            "severity": "medium",
            "category": data.type.replace("_", " ").title(),
            "suggested_response": "Our team will investigate this issue and respond within 24 hours.",
            "error": str(e),
        }


@router.post("/ai/draft-announcement")
async def draft_announcement(data: AnnouncementDraftRequest):
    """AI-powered citizen-facing announcement draft from a short staff hint."""
    try:
        return await water.draft_announcement(data.area, data.hint)
    except Exception as e:
        return {
            "draft": f"Dear residents of {data.area}, please be informed of a water supply update. Our teams are working to address the situation promptly.",
            "error": str(e),
        }


@router.post("/ai/ask")
async def citizen_ask(data: CitizenAskRequest):
    """Answer a citizen water-related question using live ward/schedule context."""
    try:
        return await water.answer_citizen_question(data.question, data.ward_context)
    except Exception as e:
        return {
            "answer": "I'm unable to answer that right now. Please contact BWSSB helpline at 1916 for assistance.",
            "error": str(e),
        }


@router.post("/ai/insights")
async def issue_insights(data: InsightsRequest):
    """Generate a short AI insight summary of recurring issue patterns for municipality staff."""
    try:
        return await water.issue_insights(data.issue_summary)
    except Exception as e:
        return {
            "summary": "Unable to generate insights at this time. Please refresh and try again.",
            "error": str(e),
        }
