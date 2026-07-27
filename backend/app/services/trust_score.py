from sqlalchemy.orm import Session

from app.models import BusRoute
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma


async def get_routes(db: Session, time_slot: str | None = None) -> list[dict]:
    q = db.query(BusRoute)
    if time_slot:
        q = q.filter(BusRoute.time_slot == time_slot)
    routes = q.order_by(BusRoute.trust_score.desc()).all()
    return [_route_to_dict(r) for r in routes]


def _route_to_dict(r: BusRoute) -> dict:
    return {
        "id": r.id,
        "route_number": r.route_number,
        "name": r.name,
        "stops": r.stops,
        "avg_delay_minutes": r.avg_delay_minutes,
        "trust_score": r.trust_score,
        "time_slot": r.time_slot,
        "citizen_reports_on_time": r.citizen_reports_on_time,
        "citizen_reports_late": r.citizen_reports_late,
        **source_badge(DataTier.REPORTED, "GTFS route structure + simulated reliability"),
    }


async def get_recommendation(db: Session, origin: str, dest: str, time_slot: str = "8AM") -> dict:
    routes = (
        db.query(BusRoute)
        .filter(BusRoute.time_slot == time_slot)
        .order_by(BusRoute.trust_score.desc())
        .limit(5)
        .all()
    )
    route_data = [_route_to_dict(r) for r in routes]
    system = (
        "You are a public transport advisor. Given route trust scores and delays, "
        "recommend the best route for a commuter. Respond in JSON with "
        '{ "recommended_route", "trust_score", "reasoning", "alternatives" }.'
    )
    prompt = f"Commute from {origin} to {dest} at {time_slot}. Routes: {route_data}"
    response = await gemma.generate(system, prompt)
    result = gemma.parse_json(response)
    if "recommended_route" not in result and routes:
        best = routes[0]
        result = {
            "recommended_route": f"Route {best.route_number}",
            "trust_score": best.trust_score,
            "reasoning": (
                f"Route {best.route_number} has the highest trust score ({best.trust_score}) "
                f"with only {best.avg_delay_minutes} min average delay for {time_slot} commutes."
            ),
            "alternatives": [f"Route {r.route_number}" for r in routes[1:3]],
        }
    return result


def report_route(db: Session, route_id: int, on_time: bool) -> dict:
    route = db.query(BusRoute).filter(BusRoute.id == route_id).first()
    if not route:
        return {"error": "Route not found"}
    if on_time:
        route.citizen_reports_on_time += 1
    else:
        route.citizen_reports_late += 1
    total = route.citizen_reports_on_time + route.citizen_reports_late
    on_time_pct = route.citizen_reports_on_time / total * 100 if total else 50
    route.trust_score = round(min(98, max(20, on_time_pct * 0.7 + (100 - route.avg_delay_minutes * 3) * 0.3)), 1)
    db.commit()
    return _route_to_dict(route)
