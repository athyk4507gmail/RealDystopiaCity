from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import metabolism

router = APIRouter(prefix="/api/metabolism", tags=["metabolism"])


class ResilienceWeightsOverride(BaseModel):
    weights: dict[str, float] | None = None
    vitals_snapshot: dict[str, float] | None = None


class CausalTraceRequest(BaseModel):
    scenario: str
    node_id: str
    delta_pct: float


@router.get("/vitals")
async def vitals(db: Session = Depends(get_db)):
    return await metabolism.get_vital_signs(db)


@router.post("/resilience-score")
async def resilience_score(data: ResilienceWeightsOverride, db: Session = Depends(get_db)):
    subsystem_state = await metabolism.get_real_subsystem_state(db, data.vitals_snapshot)
    return metabolism.compute_resilience_score(subsystem_state, data.weights)


@router.post("/stress-test/{event_type}")
async def stress_test(event_type: str, compare: bool = False, db: Session = Depends(get_db)):
    if compare:
        return await metabolism.compare_with_without_intervention(db, event_type)
    return await metabolism.run_stress_test(db, event_type)


@router.get("/causal-graph")
def get_causal_graph(scenario: str):
    return metabolism.get_causal_graph(scenario)


@router.post("/causal-graph/trace")
async def trace_causal_graph(data: CausalTraceRequest, db: Session = Depends(get_db)):
    return await metabolism.trace_causal_graph(db, data.scenario, data.node_id, data.delta_pct)
