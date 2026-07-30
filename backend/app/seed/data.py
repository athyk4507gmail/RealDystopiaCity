from datetime import date, datetime, timedelta
import random

from sqlalchemy.orm import Session

from app.models import (
    BusRoute,
    RoadSegment,
    TrafficEvent,
    TrafficSignal,
    Ward,
    WaterComplaint,
)
from app.seed.budget_data import seed_budget_data
from app.services.canonical_locations import get_canonical_roads, get_canonical_wards, get_household_size


WARD_NAMES = [ward["name"] for ward in get_canonical_wards()]
ROAD_NAMES = [road["name"] for road in get_canonical_roads()]

BUS_ROUTES = [
    ("9", "Shivaji Nagar - Electronic City"), ("14", "Hebbal - Jayanagar"),
    ("22", "Whitefield - Majestic"), ("45", "Yelahanka - BTM Layout"),
    ("67", "Marathahalli - Kengeri"), ("101", "Airport - Silk Board"),
    ("201", "Indiranagar - Banashankari"), ("305", "Koramangala - Peenya"),
]


def _ward_polygon(lat: float, lng: float, size: float = 0.008) -> list:
    return [
        [lng - size, lat - size], [lng + size, lat - size],
        [lng + size, lat + size], [lng - size, lat + size],
        [lng - size, lat - size],
    ]


def _seed_complaints(db: Session) -> None:
    complaint_types = ["no-supply", "low-pressure", "leakage", "contamination"]
    ward_ids = [w.id for w in db.query(Ward).limit(12).all()]
    if not ward_ids:
        return

    for i in range(24):
        ward_id = ward_ids[i % len(ward_ids)]
        ctype = complaint_types[i % len(complaint_types)]
        days_ago = random.randint(0, 14)
        db.add(WaterComplaint(
            ward_id=ward_id,
            type=ctype,
            description=f"Reported {ctype.replace('-', ' ')} issue in ward area",
            status="open" if i % 3 else "resolved",
            created_at=datetime.now() - timedelta(days=days_ago, hours=random.randint(0, 12)),
        ))


def seed_database(db: Session) -> None:
    # Seed budget data first (this can run independently)
    seed_budget_data(db)
    
    if db.query(Ward).count() > 0:
        if db.query(WaterComplaint).count() < 10:
            _seed_complaints(db)
            db.commit()
        return

    base_lat, base_lng = 12.9716, 77.5946
    today = date.today()

    for i, name in enumerate(WARD_NAMES):
        angle = (i / len(WARD_NAMES)) * 6.283
        lat = base_lat + 0.05 * (i % 5 - 2) + 0.01 * random.random()
        lng = base_lng + 0.05 * (i // 5 - 2) + 0.01 * random.random()
        days_ago = random.randint(2, 8)
        ward = Ward(
            name=name,
            population=random.randint(15000, 85000),
            houses=random.randint(3000, 18000),
            tank_capacity_litres=random.uniform(80000, 250000),
            available_water_litres=random.uniform(20000, 180000),
            last_supply_date=today - timedelta(days=days_ago),
            avg_daily_consumption=random.uniform(12000, 45000),
            complaints=random.randint(0, 15),
            leakage_reports=random.randint(0, 8),
            temperature_c=random.uniform(28, 38),
            growth_rate_pct=random.uniform(1.2, 4.5),
            lat=lat,
            lng=lng,
            polygon=_ward_polygon(lat, lng),
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

    db.add(WaterComplaint(
        ward_id=1, type="low_pressure", description="No water for 3 days",
        status="open",
    ))

    _seed_complaints(db)
    db.commit()
    
    # Seed budget data
    seed_budget_data(db)
