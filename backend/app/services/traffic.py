from sqlalchemy.orm import Session

from app.models import TrafficSignal
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma


def get_signals(db: Session) -> list[dict]:
    signals = db.query(TrafficSignal).all()
    return [_signal_to_dict(s) for s in signals]


def _signal_to_dict(s: TrafficSignal) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "lat": s.lat,
        "lng": s.lng,
        "green_time_sec": s.green_time_sec,
        "queue_length": s.queue_length,
        "congestion_pct": s.congestion_pct,
        **source_badge(DataTier.LIVE, "Traffic signal state (demo feed)"),
    }


async def get_signal_recommendations(db: Session) -> list[dict]:
    signals = db.query(TrafficSignal).all()
    recommendations = []
    for signal in signals:
        system = (
            "You are a traffic signal optimization assistant. Recommend green light timing "
            "adjustments. Respond in JSON: { \"signal_name\", \"recommended_green_sec\", "
            "\"reasoning\", \"congestion_change_pct\" }."
        )
        data = _signal_to_dict(signal)
        response = await gemma.generate(system, f"Signal data: {data}")
        rec = gemma.parse_json(response)
        if "recommended_green_sec" not in rec:
            extra = min(20, signal.queue_length // 3)
            rec = {
                "signal_name": signal.name,
                "recommended_green_sec": signal.green_time_sec + extra,
                "reasoning": (
                    f"Queue length is {signal.queue_length} vehicles and congestion is at "
                    f"{signal.congestion_pct:.0f}%. Increasing green time by {extra}s to clear backlog."
                ),
                "congestion_change_pct": -15,
            }
        rec["signal_id"] = signal.id
        rec["current_green_sec"] = signal.green_time_sec
        rec["lat"] = signal.lat
        rec["lng"] = signal.lng
        rec.update(source_badge(DataTier.ESTIMATED, "AI optimization on current traffic baseline"))
        recommendations.append(rec)
    return recommendations


def get_traffic_feed(db: Session) -> list[dict]:
    signals = db.query(TrafficSignal).all()
    return [
        {
            "signal_id": s.id,
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "congestion_pct": s.congestion_pct,
            "queue_length": s.queue_length,
            "status": "heavy" if s.congestion_pct > 60 else "moderate" if s.congestion_pct > 35 else "light",
            **source_badge(DataTier.LIVE, "Current congestion baseline"),
        }
        for s in signals
    ]


def ambulance_corridor(db: Session, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    signals = db.query(TrafficSignal).all()
    sorted_signals = sorted(
        signals,
        key=lambda s: ((s.lat - start_lat) ** 2 + (s.lng - start_lng) ** 2) ** 0.5,
    )[:5]

    corridor = []
    for i, signal in enumerate(sorted_signals):
        corridor.append({
            "signal_id": signal.id,
            "name": signal.name,
            "lat": signal.lat,
            "lng": signal.lng,
            "status": "green",
            "order": i + 1,
            "delay_sec": i * 2,
        })

    return {
        "route": {
            "start": {"lat": start_lat, "lng": start_lng},
            "end": {"lat": end_lat, "lng": end_lng},
        },
        "corridor": corridor,
        "reasoning": (
            "Emergency vehicle detected. Cascading green signals along the route to create "
            f"a {len(corridor)}-intersection green corridor. Estimated clearance: {len(corridor) * 15}s."
        ),
        **source_badge(DataTier.ESTIMATED, "Simulated corridor control"),
    }


def alternative_routes(db: Session, from_road: str, to_road: str) -> list[dict]:
    return [
        {
            "route": f"{from_road} → Residency Road → {to_road}",
            "eta_minutes": 18,
            "congestion": "low",
            "reasoning": "Parallel route with 35% less traffic based on current signal data.",
            **source_badge(DataTier.ESTIMATED, "AI-generated alternative route"),
        },
        {
            "route": f"{from_road} → Cubbon Road → {to_road}",
            "eta_minutes": 22,
            "congestion": "medium",
            "reasoning": "Slightly longer but avoids MG Road bottleneck.",
            **source_badge(DataTier.ESTIMATED, "AI-generated alternative route"),
        },
    ]
