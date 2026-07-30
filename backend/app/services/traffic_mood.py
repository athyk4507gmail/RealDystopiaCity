from datetime import datetime

from sqlalchemy.orm import Session

from app.models import TrafficEvent
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma

TRAFFIC_MOOD_PROMPT = """You are a traffic forecasting assistant. Given the following list of upcoming
local events, news, and social signals, predict which roads will experience
traffic surges, how many hours in advance the surge will begin, and the
expected severity (low/medium/high). Explain your reasoning briefly.
Respond in JSON: { "predictions": [ { "road", "severity", "hours_before_surge", "reasoning" } ] }."""


async def get_events(db: Session) -> list[dict]:
    events = db.query(TrafficEvent).order_by(TrafficEvent.event_time).all()
    return [_event_to_dict(e) for e in events]


def _event_to_dict(e: TrafficEvent) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "event_type": e.event_type,
        "location": e.location,
        "lat": e.lat,
        "lng": e.lng,
        "event_time": e.event_time.isoformat(),
        "crowd_size": e.crowd_size,
        "affected_roads": e.affected_roads,
        "predicted_severity": e.predicted_severity,
        "hours_before_surge": e.hours_before_surge,
        "reasoning": e.reasoning,
        **source_badge(DataTier.REPORTED, "Real event/news listing anchor"),
    }


async def predict_surges(db: Session) -> list[dict]:
    events = db.query(TrafficEvent).all()
    event_list = [_event_to_dict(e) for e in events]
    prompt = f"Signals: {event_list}"
    response = await gemma.generate(TRAFFIC_MOOD_PROMPT, prompt, fallback_type="traffic_mood")
    result = gemma.parse_json(response)
    predictions = result.get("predictions", [])

    for event in events:
        for pred in predictions:
            if pred.get("road") in event.affected_roads:
                event.predicted_severity = pred.get("severity", event.predicted_severity)
                event.hours_before_surge = pred.get("hours_before_surge", event.hours_before_surge)
                event.reasoning = pred.get("reasoning", "")
    db.commit()

    return predictions if predictions else [
        {
            "road": e.affected_roads[0] if e.affected_roads else e.location,
            "severity": e.predicted_severity,
            "hours_before_surge": e.hours_before_surge,
            "reasoning": f"{e.title} expected to draw {e.crowd_size:,} people near {e.location}.",
            "event_id": e.id,
            "lat": e.lat,
            "lng": e.lng,
            **source_badge(DataTier.ESTIMATED, "AI forecast from reported event signals"),
        }
        for e in events
    ]


async def trigger_event(db: Session, event_id: int) -> dict:
    event = db.query(TrafficEvent).filter(TrafficEvent.id == event_id).first()
    if not event:
        return {"error": "Event not found"}
    predictions = await predict_surges(db)
    event_preds = [p for p in predictions if p.get("event_id") == event_id or p.get("road") in event.affected_roads]
    return {
        "event": _event_to_dict(event),
        "predictions": event_preds,
        "simulation": {
            "status": "active",
            "cars_building": True,
            "affected_roads": event.affected_roads,
            "severity": event.predicted_severity,
            "started_at": datetime.utcnow().isoformat(),
        },
    }
