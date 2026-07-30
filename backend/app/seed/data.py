from datetime import date, datetime, timedelta
import random

from sqlalchemy.orm import Session

from app.services.ward_baseline import get_ward_baseline, load_ward_seed_data
from app.models import (
    BusRoute,
    RoadSegment,
    TrafficEvent,
    TrafficSignal,
    Ward,
    WaterComplaint,
    WaterSchedule,
)
from app.seed.budget_data import seed_budget_data
from app.services.canonical_locations import get_canonical_roads, get_canonical_wards
from app.services.ward_baseline import get_ward_baseline


WARD_NAMES = [ward["name"] for ward in get_canonical_wards()]
ROAD_NAMES = [road["name"] for road in get_canonical_roads()]
WARD_COORDS = {ward["name"]: (ward["lat"], ward["lng"]) for ward in get_canonical_wards()}

BUS_ROUTES = [
    ("9", "Shivaji Nagar - Electronic City"), ("14", "Hebbal - Jayanagar"),
    ("22", "Whitefield - Majestic"), ("45", "Yelahanka - BTM Layout"),
    ("67", "Marathahalli - Kengeri"), ("101", "Airport - Silk Board"),
    ("201", "Indiranagar - Banashankari"), ("305", "Koramangala - Peenya"),
]


def _staggered_days_since_supply(ward_index: int) -> int:
    """Realistic rotation: ~1/4 supplied yesterday, 1/4 two days ago, etc."""
    bucket = ward_index % 4
    if bucket == 0:
        return 1
    if bucket == 1:
        return 2
    if bucket == 2:
        return 3
    return 4 + (ward_index % 3)  # 4, 5, or 6 — overdue bucket


def _refresh_ward_supply_dates(db: Session) -> None:
    """Re-stagger last_supply_date so fairness produces a realistic mix."""
    today = date.today()
    for i, ward in enumerate(db.query(Ward).order_by(Ward.id).all()):
        ward.last_supply_date = today - timedelta(days=_staggered_days_since_supply(i))
    db.commit()


def _ward_polygon(lat: float, lng: float, size: float = 0.012) -> list:
    return [
        [lng - size, lat - size], [lng + size, lat - size],
        [lng + size, lat + size], [lng - size, lat + size],
        [lng - size, lat - size],
    ]


def _apply_ward_baseline(ward: Ward) -> None:
    baseline = get_ward_baseline(ward.name)
    if not baseline:
        return
    ward.population = baseline["population_estimate_2026"]
    ward.houses = baseline["houses"]
    if baseline.get("lat") is not None:
        ward.lat = baseline["lat"]
    if baseline.get("lng") is not None:
        ward.lng = baseline["lng"]
    if baseline.get("polygon"):
        ward.polygon = baseline["polygon"]


def _update_existing_ward_baselines(db: Session) -> None:
    for ward in db.query(Ward).all():
        _apply_ward_baseline(ward)
    db.commit()


def _sync_wards_from_seed(db: Session) -> None:
    """Add any wards from ward_seed_data.json that are not yet in the DB."""
    existing = {w.name.lower() for w in db.query(Ward).all()}
    today = date.today()
    seed_wards = load_ward_seed_data().get("wards", [])
    added = 0
    for i, entry in enumerate(seed_wards):
        name = entry["name"]
        if name.lower() in existing:
            continue
        lat = entry.get("lat", 12.97 + 0.01 * i)
        lng = entry.get("lng", 77.59 + 0.01 * i)
        polygon = entry.get("polygon") or _ward_polygon(lat, lng)
        baseline = get_ward_baseline(name)
        population = baseline["population_estimate_2026"] if baseline else random.randint(15000, 85000)
        houses = baseline["houses"] if baseline else random.randint(3000, 18000)
        days_ago = _staggered_days_since_supply(len(existing) + added)
        db.add(Ward(
            name=name,
            population=population,
            houses=houses,
            tank_capacity_litres=round(random.uniform(80000, 250000)),
            available_water_litres=round(random.uniform(20000, 180000)),
            last_supply_date=today - timedelta(days=days_ago),
            avg_daily_consumption=round(random.uniform(12000, 45000)),
            complaints=random.randint(0, 8),
            leakage_reports=random.randint(0, 5),
            temperature_c=round(random.uniform(28, 38), 1),
            growth_rate_pct=2.1,
            lat=lat,
            lng=lng,
            polygon=polygon,
        ))
        added += 1
    if added:
        db.commit()


def sync_ward_seed_data(db: Session) -> int:
    """Public entry: add missing wards from ward_seed_data.json. Returns count added."""
    before = db.query(Ward).count()
    _sync_wards_from_seed(db)
    _update_existing_ward_baselines(db)
    return db.query(Ward).count() - before


def _seed_open_complaints(db: Session) -> None:
    """A small set of live-style open complaints for the active dashboard."""
    if db.query(WaterComplaint).filter(WaterComplaint.status == "open").count() >= 8:
        return
    complaint_types = ["no-supply", "low-pressure", "leakage", "contamination"]
    ward_ids = [w.id for w in db.query(Ward).limit(12).all()]
    if not ward_ids:
        return

    for i in range(12):
        ward_id = ward_ids[i % len(ward_ids)]
        ctype = complaint_types[i % len(complaint_types)]
        days_ago = random.randint(0, 5)
        db.add(WaterComplaint(
            ward_id=ward_id,
            type=ctype,
            description=f"Active {ctype.replace('-', ' ')} report awaiting field response",
            status="open",
            created_at=datetime.now() - timedelta(days=days_ago, hours=random.randint(0, 12)),
        ))


def seed_database(db: Session) -> None:
    seed_budget_data(db)

    if db.query(Ward).count() > 0:
        # Population baseline: 2011 census figures, projected forward at ~2.1%/yr
        # Bengaluru growth rate. Not live official data — clearly documented estimate.
        _sync_wards_from_seed(db)
        _update_existing_ward_baselines(db)
        _refresh_ward_supply_dates(db)
        # Historical complaints/schedules: one-time via python -m app.data.generate_historical_complaints
        _seed_open_complaints(db)
        db.commit()
        return

    today = date.today()

    seed_wards = load_ward_seed_data().get("wards", [])
    ward_source = seed_wards if seed_wards else [{"name": n, **({"lat": WARD_COORDS[n][0], "lng": WARD_COORDS[n][1]} if n in WARD_COORDS else {})} for n in WARD_NAMES]

    for i, entry in enumerate(ward_source):
        name = entry["name"]
        lat = entry.get("lat") or WARD_COORDS.get(name, (12.9716 + 0.01 * i, 77.5946 + 0.01 * i))[0]
        lng = entry.get("lng") or WARD_COORDS.get(name, (12.9716 + 0.01 * i, 77.5946 + 0.01 * i))[1]
        polygon = entry.get("polygon") or _ward_polygon(lat, lng)
        days_ago = _staggered_days_since_supply(i)
        baseline = get_ward_baseline(name)
        if baseline:
            population = baseline["population_estimate_2026"]
            houses = baseline["houses"]
        else:
            population = random.randint(15000, 85000)
            houses = random.randint(3000, 18000)

        ward = Ward(
            name=name,
            population=population,
            houses=houses,
            tank_capacity_litres=round(random.uniform(80000, 250000)),
            available_water_litres=round(random.uniform(20000, 180000)),
            last_supply_date=today - timedelta(days=days_ago),
            avg_daily_consumption=round(random.uniform(12000, 45000)),
            complaints=random.randint(0, 8),
            leakage_reports=random.randint(0, 5),
            temperature_c=round(random.uniform(28, 38), 1),
            growth_rate_pct=2.1,
            lat=lat,
            lng=lng,
            polygon=polygon,
        )
        db.add(ward)

    db.flush()

    for route_num, route_name in BUS_ROUTES:
        for slot in ["6AM", "8AM", "12PM", "6PM"]:
            delay = random.uniform(2, 18) if random.random() > 0.3 else random.uniform(0, 5)
            score = max(20, min(98, 100 - delay * 4 + random.uniform(-5, 5)))
            db.add(BusRoute(
                route_number=route_num,
                name=route_name,
                stops=random.randint(12, 35),
                avg_delay_minutes=round(delay, 1),
                trust_score=round(score, 1),
                time_slot=slot,
                citizen_reports_on_time=random.randint(20, 150),
                citizen_reports_late=random.randint(5, 80),
            ))

    for week in range(5):
        for j, road in enumerate(ROAD_NAMES):
            base_lat = 12.97 + (j % 5) * 0.01
            base_lng = 77.59 + (j // 5) * 0.02
            coords = [
                [base_lng, base_lat],
                [base_lng + 0.015, base_lat + 0.005],
            ]
            braking = int(10 + week * 8 + random.randint(0, 15))
            swerving = int(5 + week * 4 + random.randint(0, 10))
            variance = round(8 + week * 3 + random.uniform(0, 5), 1)
            risk = min(95, 20 + week * 12 + braking * 0.3 + swerving * 0.4)
            accidents = 1 if week >= 3 and risk > 60 else 0
            db.add(RoadSegment(
                name=road,
                coordinates=coords,
                hard_braking_events=braking,
                swerving_events=swerving,
                speed_variance=variance,
                risk_score=round(risk, 1),
                accident_count=accidents,
                week_index=week,
            ))

    signal_positions = [
        ("MG Road Junction", 12.975, 77.606),
        ("Brigade Circle", 12.972, 77.608),
        ("Cubbon Park Gate", 12.976, 77.593),
        ("Trinity Circle", 12.973, 77.617),
        ("Silk Board", 12.917, 77.623),
        ("Hebbal Flyover", 13.035, 77.597),
        ("Marathahalli Bridge", 12.959, 77.701),
        ("Electronic City Toll", 12.845, 77.665),
    ]
    for name, lat, lng in signal_positions:
        db.add(TrafficSignal(
            name=name,
            lat=lat,
            lng=lng,
            green_time_sec=random.randint(25, 55),
            queue_length=random.randint(5, 60),
            congestion_pct=random.uniform(15, 75),
        ))

    events = [
        ("IPL Match - Chinnaswamy Stadium", "sports", "MG Road", 12.978, 77.599, 19, 45000),
        ("Wedding Procession - Koramangala", "wedding", "Koramangala", 12.935, 77.624, 18, 800),
        ("School Annual Day - Indiranagar", "school", "100 Feet Road", 12.978, 77.641, 16, 2000),
        ("Farmers Protest - Town Hall", "protest", "KG Road", 12.977, 77.587, 17, 5000),
        ("Diwali Shopping Rush", "festival", "Commercial Street", 12.983, 77.608, 20, 30000),
        ("Heavy Rain Forecast", "weather", "Outer Ring Road", 12.950, 77.650, 14, 0),
    ]
    for title, etype, loc, lat, lng, hour, crowd in events:
        event_time = datetime.now().replace(hour=hour, minute=0, second=0)
        db.add(TrafficEvent(
            title=title,
            event_type=etype,
            location=loc,
            lat=lat,
            lng=lng,
            event_time=event_time,
            crowd_size=crowd,
            affected_roads=random.sample(ROAD_NAMES, k=3),
            predicted_severity=random.choice(["low", "medium", "high"]),
            hours_before_surge=round(random.uniform(1, 4), 1),
        ))

    db.commit()

    # Historical complaints: one-time via python -m app.data.generate_historical_complaints
    _seed_open_complaints(db)
    db.commit()

    seed_budget_data(db)
