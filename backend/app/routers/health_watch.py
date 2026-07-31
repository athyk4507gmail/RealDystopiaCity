from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import health_watch

router = APIRouter(prefix="/api/health-watch", tags=["health-watch"])


@router.get("/wards")
async def list_ward_scores(db: Session = Depends(get_db)):
    """
    Returns all wards with current risk score, trend direction,
    and data-freshness badges for each contributing input.
    Gemma reasoning is NOT included here (use /wards/{ward_id} for that)
    so the list endpoint stays fast.
    """
    return await health_watch.get_all_ward_scores(db)


@router.get("/wards/{ward_id}")
async def ward_detail(ward_id: int, db: Session = Depends(get_db)):
    """
    Full detail for one ward: raw feature values, scoring breakdown,
    Gemma causal explanation + intervention, 7-day trend series,
    data-freshness badges, and Metabolism cross-link.
    """
    record = await health_watch.get_ward_score(db, ward_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Ward {ward_id} not found")
    return record


@router.get("/cache-status")
def cache_status():
    """
    Returns which ward+date keys are currently warmed in the Gemma cache.
    Used by the warm script to skip wards already cached for today.
    """
    from datetime import date
    today = date.today().isoformat()
    warmed = [
        {"ward_id": int(k.split(":")[0]), "cached_date": k.split(":")[1]}
        for k in health_watch._gemma_cache.keys()
        if k.endswith(f":{today}")
    ]
    return {"today": today, "warmed_ward_ids": [w["ward_id"] for w in warmed], "entries": warmed}


@router.post("/refresh")
async def refresh_scores(db: Session = Depends(get_db)):
    """
    Recompute health-watch scores for all wards from current data sources.
    Returns a summary of how many wards were updated and how many are trending up.
    """
    return await health_watch.refresh_all(db)
