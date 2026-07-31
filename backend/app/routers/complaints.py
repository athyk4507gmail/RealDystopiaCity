from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import water

router = APIRouter(prefix="/api/complaints", tags=["complaints"])


@router.get("")
def list_all_complaints(
    ward_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    return water.get_complaints(db, ward_id=ward_id, status=status)
