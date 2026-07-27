from datetime import date, timedelta
from typing import Optional
import random
from sqlalchemy.orm import Session

from app.models import Ward, WaterComplaint, WaterSchedule
from app.services.data_sources import DataTier, source_badge
from app.services.gemma import gemma


WATER_SYSTEM_PROMPT = """You are a municipal water planning assistant. Analyze the following ward data
and recommend the best water supply schedule based on fairness, demand,
weather, available water, complaints, and historical supply patterns.
Respond in structured JSON: { "priority", "supply_today", "duration_hours",
"allocation_litres", "reasoning", "supply_start_time", "supply_end_time" }.

Also determine the optimal supply_start_time and supply_end_time (24-hour format,
e.g. "06:00" and "09:30") based on: ward priority (higher priority wards get
earlier time slots), typical low-demand hours (early morning preferred over
midday), and avoiding time overlap with other wards sharing the same pipeline
zone if that data is available. Include these two fields in your JSON response."""

SUB_LOCALITY_TEMPLATES = [
    "Main Road",
    "Market Area",
    "Apartment Cluster",
    "School Zone",
    "Tank Road",
    "Bus Stand Area",
]


def _default_supply_window(priority: str, ward_index: int) -> tuple[str, str]:
    slots = {
        "High": ("05:30", "08:30"),
        "Medium": ("08:00", "11:00"),
        "Low": ("14:00", "17:00"),
    }
    start, end = slots.get(priority, ("09:00", "12:00"))
    offset = (ward_index % 3) * 30
    start_h, start_m = map(int, start.split(":"))
    end_h, end_m = map(int, end.split(":"))
    start_m += offset
    end_m += offset
    if start_m >= 60:
        start_h += 1
        start_m -= 60
    if end_m >= 60:
        end_h += 1
        end_m -= 60
    return f"{start_h:02d}:{start_m:02d}", f"{end_h:02d}:{end_m:02d}"


def generate_sub_localities(ward_name: str, allocation_litres: float) -> list[dict]:
    count = random.randint(3, 5)
    names = [f"{ward_name} {suffix}" for suffix in random.sample(SUB_LOCALITY_TEMPLATES, count)]
    weights = list(range(count, 0, -1))
    total_weight = sum(weights)
    remaining = allocation_litres
    sub_localities = []

    for index, (name, weight) in enumerate(zip(names, weights)):
        if index == len(names) - 1:
            litres = round(remaining)
        else:
            litres = round(allocation_litres * weight / total_weight)
            remaining -= litres
        sub_localities.append({
            "name": name,
            "priority_rank": index + 1,
            "allocation_litres": litres,
        })

    return sub_localities


def _schedule_to_dict(schedule: WaterSchedule, ward_name: str) -> dict:
    sub_localities = schedule.sub_localities or generate_sub_localities(
        ward_name, schedule.allocation_litres
    )
    return {
        "ward_id": schedule.ward_id,
        "ward_name": ward_name,
        "supply_today": schedule.supply_today,
        "allocation_litres": schedule.allocation_litres,
        "duration_hours": schedule.duration_hours,
        "supply_start_time": schedule.supply_start_time,
        "supply_end_time": schedule.supply_end_time,
        "priority": schedule.priority,
        "reasoning": schedule.reasoning,
        "sub_localities": sub_localities,
        **source_badge(DataTier.ESTIMATED, "AI-generated schedule from grounded ward inputs"),
    }


async def get_wards(db: Session) -> list[dict]:
    wards = db.query(Ward).all()
    return [_ward_to_dict(w) for w in wards]


def _ward_to_dict(w: Ward) -> dict:
    days_since = (date.today() - w.last_supply_date).days
    return {
        "id": w.id,
        "name": w.name,
        "population": w.population,
        "houses": w.houses,
        "tank_capacity_litres": w.tank_capacity_litres,
        "available_water_litres": w.available_water_litres,
        "last_supply_date": w.last_supply_date.isoformat(),
        "days_since_supply": days_since,
        "avg_daily_consumption": w.avg_daily_consumption,
        "complaints": w.complaints,
        "leakage_reports": w.leakage_reports,
        "temperature_c": w.temperature_c,
        "growth_rate_pct": w.growth_rate_pct,
        "lat": w.lat,
        "lng": w.lng,
        "polygon": w.polygon,
        **source_badge(DataTier.REPORTED, "Ward identity is real; population is census-grounded when available"),
    }


async def generate_schedule(db: Session) -> list[dict]:
    wards = db.query(Ward).all()
    today = date.today()
    db.query(WaterSchedule).filter(WaterSchedule.schedule_date == today).delete()
    results = []

    for index, ward in enumerate(wards):
        ward_data = _ward_to_dict(ward)
        prompt = f"Ward data: {ward_data}"
        response = await gemma.generate(WATER_SYSTEM_PROMPT, prompt)
        rec = gemma.parse_json(response)

        priority = str(rec.get("priority", "Medium"))
        allocation = float(rec.get("allocation_litres", ward.avg_daily_consumption))
        default_start, default_end = _default_supply_window(priority, index)
        supply_start = str(rec.get("supply_start_time", default_start))
        supply_end = str(rec.get("supply_end_time", default_end))
        sub_localities = rec.get("sub_localities")
        if not sub_localities:
            sub_localities = generate_sub_localities(ward.name, allocation)

        schedule = WaterSchedule(
            ward_id=ward.id,
            supply_today=bool(rec.get("supply_today", False)),
            allocation_litres=allocation,
            duration_hours=float(rec.get("duration_hours", 2)),
            supply_start_time=supply_start,
            supply_end_time=supply_end,
            priority=priority,
            reasoning=str(rec.get("reasoning", "")),
            sub_localities=sub_localities,
            schedule_date=today,
        )
        db.add(schedule)
        results.append(_schedule_to_dict(schedule, ward.name))

    db.commit()
    return results


async def get_today_schedule(db: Session) -> list[dict]:
    today = date.today()
    schedules = db.query(WaterSchedule).filter(WaterSchedule.schedule_date == today).all()
    if not schedules:
        return await generate_schedule(db)

    ward_map = {w.id: w for w in db.query(Ward).all()}
    return [
        _schedule_to_dict(
            s,
            ward_map[s.ward_id].name if s.ward_id in ward_map else "Unknown",
        )
        for s in schedules
    ]


def predict_demand(db: Session, ward_id: int, days: int = 14) -> list[dict]:
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        return []

    base = ward.avg_daily_consumption
    seasonal = 1.0 + (ward.temperature_c - 30) * 0.03
    growth = 1.0 + ward.growth_rate_pct / 100 / 12
    predictions = []
    for d in range(days):
        day_factor = 1.1 if d % 7 in (5, 6) else 1.0
        festival_spike = 1.25 if d == 10 else 1.0
        predicted = base * seasonal * growth * day_factor * festival_spike
        predictions.append({
            "day": (date.today() + timedelta(days=d)).isoformat(),
            "predicted_litres": round(predicted),
            "confidence": round(0.85 + random.uniform(-0.05, 0.05), 2),
            **source_badge(DataTier.ESTIMATED, "Forecast derived from ward consumption and weather factors"),
        })
    return predictions


async def detect_leakage(image_b64: str) -> dict:
    system = (
        "You are a water infrastructure inspector. Analyze the image for pipe leakage, "
        "overflow, or broken pipeline. Respond in JSON: "
        '{ "is_leakage", "confidence", "type", "reasoning" }.'
    )
    response = await gemma.generate(system, "Analyze this image for water leakage.", image_b64=image_b64)
    return gemma.parse_json(response)


def create_complaint(db: Session, ward_id: int, ctype: str, description: str, image_url: Optional[str] = None) -> dict:
    complaint = WaterComplaint(ward_id=ward_id, type=ctype, description=description, image_url=image_url)
    db.add(complaint)
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if ward:
        ward.complaints += 1
        if ctype == "leakage":
            ward.leakage_reports += 1
    db.commit()
    db.refresh(complaint)
    return _complaint_to_dict(complaint, ward.name if ward else "Unknown")


def _complaint_to_dict(complaint: WaterComplaint, ward_name: str) -> dict:
    return {
        "id": complaint.id,
        "ward_id": complaint.ward_id,
        "ward_name": ward_name,
        "type": complaint.type,
        "description": complaint.description,
        "status": complaint.status,
        "created_at": complaint.created_at.isoformat(),
        **source_badge(DataTier.ESTIMATED, "Simulated citizen report"),
    }


def get_complaints(db: Session, ward_id: Optional[int] = None, status: Optional[str] = None) -> list[dict]:
    q = db.query(WaterComplaint)
    if ward_id:
        q = q.filter(WaterComplaint.ward_id == ward_id)
    if status:
        q = q.filter(WaterComplaint.status == status)

    ward_map = {w.id: w.name for w in db.query(Ward).all()}
    return [
        _complaint_to_dict(c, ward_map.get(c.ward_id, "Unknown"))
        for c in q.order_by(WaterComplaint.created_at.desc()).all()
    ]
