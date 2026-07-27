from sqlalchemy.orm import Session

from app.models import RoadSegment
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma

REPORTED_BLACK_SPOTS = [
    {"name": "Silk Board Junction", "lat": 12.9176, "lng": 77.6235},
    {"name": "Hebbal Flyover", "lat": 13.0358, "lng": 77.5970},
    {"name": "Mysore Road Satellite Bus Stand", "lat": 12.9506, "lng": 77.5375},
    {"name": "KR Puram Tin Factory Junction", "lat": 13.0086, "lng": 77.6952},
    {"name": "Central Silk Board to BTM U-turn Stretch", "lat": 12.9203, "lng": 77.6201},
    {"name": "Mekhri Circle", "lat": 13.0186, "lng": 77.5855},
    {"name": "Domlur Flyover Junction", "lat": 12.9600, "lng": 77.6387},
    {"name": "Anand Rao Circle", "lat": 12.9788, "lng": 77.5727},
]


def get_reported_black_spots() -> list[dict]:
    return [
        {
            **spot,
            "zone_type": "reported_black_spot",
            **source_badge(DataTier.REPORTED, "Publicly reported accident black spot"),
        }
        for spot in REPORTED_BLACK_SPOTS
    ]


def get_risk_segments(db: Session, week: int = 4) -> list[dict]:
    segments = (
        db.query(RoadSegment)
        .filter(RoadSegment.week_index == week)
        .order_by(RoadSegment.risk_score.desc())
        .all()
    )
    return [_segment_to_dict(s) for s in segments]


def _segment_to_dict(s: RoadSegment) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "coordinates": s.coordinates,
        "hard_braking_events": s.hard_braking_events,
        "swerving_events": s.swerving_events,
        "speed_variance": s.speed_variance,
        "risk_score": s.risk_score,
        "accident_count": s.accident_count,
        "week_index": s.week_index,
        "zone_type": "ai_predicted",
        **source_badge(DataTier.ESTIMATED, "Synthetic behavior risk score, weighted by known black-spot anchors"),
    }


def get_timeline(db: Session) -> list[dict]:
    weeks = db.query(RoadSegment.week_index).distinct().order_by(RoadSegment.week_index).all()
    timeline = []
    for (week,) in weeks:
        segments = db.query(RoadSegment).filter(RoadSegment.week_index == week).all()
        high_risk = [s for s in segments if s.risk_score > 60]
        timeline.append({
            "week": week,
            "label": f"Week {week + 1}",
            "avg_risk": round(sum(s.risk_score for s in segments) / len(segments), 1) if segments else 0,
            "high_risk_count": len(high_risk),
            "accidents": sum(s.accident_count for s in segments),
            "segments": [_segment_to_dict(s) for s in segments],
        })
    return timeline


async def explain_zone(db: Session, segment_id: int) -> dict:
    segment = db.query(RoadSegment).filter(RoadSegment.id == segment_id).first()
    if not segment:
        return {"error": "Segment not found"}

    prev_week = (
        db.query(RoadSegment)
        .filter(RoadSegment.name == segment.name, RoadSegment.week_index == max(0, segment.week_index - 1))
        .first()
    )
    braking_change = 0
    if prev_week and prev_week.hard_braking_events:
        braking_change = round(
            (segment.hard_braking_events - prev_week.hard_braking_events) / prev_week.hard_braking_events * 100
        )

    system = (
        "You are a traffic safety analyst. Explain why a road segment is flagged as accident-prone "
        "based on driving behavior data. Respond in JSON: { \"explanation\", \"risk_level\", \"recommendation\" }."
    )
    data = _segment_to_dict(segment)
    data["braking_change_pct"] = braking_change
    prompt = f"Road segment data: {data}"
    response = await gemma.generate(system, prompt)
    result = gemma.parse_json(response)
    if "explanation" not in result:
        result = {
            "explanation": (
                f"{segment.name} shows a {braking_change}% change in hard-braking events over 2 weeks, "
                f"with {segment.swerving_events} swerving incidents and speed variance of {segment.speed_variance}. "
                f"Risk score: {segment.risk_score}/100."
            ),
            "risk_level": "high" if segment.risk_score > 70 else "medium" if segment.risk_score > 45 else "low",
            "recommendation": "Deploy speed calming measures and increase patrol frequency.",
        }
    result["segment"] = _segment_to_dict(segment)
    return result
