"""
One-time generators for synthetic historical water data.

Run from backend/:
  python -m app.data.generate_historical_complaints
  python -m app.data.generate_historical_complaints --schedules-only
  python -m app.data.generate_historical_complaints --all
"""

from __future__ import annotations

import argparse
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.data.complaint_templates import (
    COMPLAINT_TYPES,
    DESCRIPTION_TEMPLATES,
    DURATION_HOURS,
    RESOLUTION_TEMPLATES,
    TEAMS,
)
from app.database import SessionLocal
from app.models import Ward, WaterComplaint, WaterSchedule
from app.seed.data import sync_ward_seed_data
from app.services.ward_baseline import load_ward_seed_data

SYNTHETIC_SEED_THRESHOLD = 2000
HISTORICAL_COMPLAINT_TARGET = 2500
HISTORICAL_SCHEDULE_DAYS = 365
SCHEDULE_SEED_THRESHOLD_DAYS = 300  # min days of history per ward before skip


def _ward_profile(ward_name: str) -> dict:
    """Load optional complaint/leakage weights from ward seed JSON."""
    data = load_ward_seed_data()
    for ward in data.get("wards", []):
        if ward["name"].lower() == ward_name.lower():
            return {
                "complaint_weight": float(ward.get("complaint_weight", 1.0)),
                "leakage_weight": float(ward.get("leakage_weight", 1.0)),
                "zone": ward.get("zone", "Central"),
            }
    return {"complaint_weight": 1.0, "leakage_weight": 1.0, "zone": "Central"}


def _seasonal_issue_weights(created_at: datetime) -> dict[str, float]:
    """Return multipliers per issue type based on month (Bengaluru patterns)."""
    month = created_at.month
    weights = {t: 1.0 for t in COMPLAINT_TYPES}
    # Monsoon: leakage spike (Jun–Sep)
    if month in (6, 7, 8, 9):
        weights["leakage"] = 1.65
        weights["contamination"] = 1.25
    # Summer heat: no-supply spike (Mar–May)
    if month in (3, 4, 5):
        weights["no-supply"] = 1.55
        weights["low-pressure"] = 1.35
    # Post-monsoon pipe stress
    if month in (10, 11):
        weights["leakage"] = 1.2
    return weights


def _pick_issue_type(ward: Ward, created_at: datetime) -> str:
    profile = _ward_profile(ward.name)
    seasonal = _seasonal_issue_weights(created_at)
    weights = []
    for t in COMPLAINT_TYPES:
        w = seasonal[t]
        if t == "leakage":
            w *= profile["leakage_weight"]
        elif t in ("no-supply", "low-pressure", "contamination"):
            w *= profile["complaint_weight"]
        weights.append(max(w, 0.05))
    return random.choices(COMPLAINT_TYPES, weights=weights, k=1)[0]


def _random_duration_hours(issue_type: str) -> float:
    low, high = DURATION_HOURS[issue_type]
    # ~8% outliers
    roll = random.random()
    if roll < 0.04:
        return round(random.uniform(1.5, 3.5), 1)  # trivial fast fix
    if roll < 0.08:
        return round(random.uniform(24, 36), 1)  # parts shortage / complex repair
    return round(random.uniform(low, high), 1)


def _format_description(issue_type: str, ward_name: str, duration: float) -> str:
    template = random.choice(DESCRIPTION_TEMPLATES[issue_type])
    hours = max(1, int(duration))
    try:
        return template.format(ward=ward_name, hours=hours)
    except KeyError:
        return template.format(ward=ward_name)


def _generate_cluster_batch(
    db: Session,
    ward: Ward,
    issue_type: str,
    base_time: datetime,
    count: int,
) -> int:
    """Near-duplicate complaints in same ward/time window (~5% of total)."""
    inserted = 0
    base_desc = _format_description(issue_type, ward.name, 6.0)
    variants = [
        base_desc,
        f"Same issue as neighbours — {base_desc[:80]}",
        f"Follow-up: still unresolved. {base_desc}",
        f"Multiple households reporting: {base_desc}",
        f"Duplicate report from adjacent lane in {ward.name}.",
    ]
    for i in range(count):
        duration = _random_duration_hours(issue_type)
        offset_mins = random.randint(0, 180) + i * random.randint(15, 45)
        created_at = base_time + timedelta(minutes=offset_mins)
        resolved_at = created_at + timedelta(hours=duration)
        db.add(
            WaterComplaint(
                ward_id=ward.id,
                type=issue_type,
                description=variants[i % len(variants)],
                status="resolved",
                created_at=created_at,
                resolved_at=resolved_at,
                resolution_comment=random.choice(RESOLUTION_TEMPLATES[issue_type]),
                assigned_team=random.choice(TEAMS),
                is_synthetic_seed=True,
            )
        )
        inserted += 1
    return inserted


def seed_historical_complaints(db: Session, *, force: bool = False) -> int:
    """
    Insert synthetic resolved complaints if below SYNTHETIC_SEED_THRESHOLD.
    Returns number of records inserted.
    """
    resolved_count = (
        db.query(WaterComplaint)
        .filter(WaterComplaint.status == "resolved")
        .count()
    )
    if not force and resolved_count >= SYNTHETIC_SEED_THRESHOLD:
        return 0

    wards = db.query(Ward).all()
    if not wards:
        return 0

    if force and resolved_count > 0:
        db.query(WaterComplaint).filter(WaterComplaint.is_synthetic_seed.is_(True)).delete()
        db.commit()
        resolved_count = 0

    to_create = HISTORICAL_COMPLAINT_TARGET - resolved_count
    if to_create <= 0:
        return 0

    inserted = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cluster_target = max(1, int(to_create * 0.05))
    cluster_inserted = 0
    regular_target = to_create - cluster_target

    ward_weights = [
        max(w.houses, 1) * _ward_profile(w.name)["complaint_weight"]
        for w in wards
    ]

    for _ in range(regular_target):
        ward = random.choices(wards, weights=ward_weights, k=1)[0]
        days_ago = random.randint(1, 365)
        created_at = now - timedelta(
            days=days_ago,
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
        )
        issue_type = _pick_issue_type(ward, created_at)
        duration = _random_duration_hours(issue_type)
        resolved_at = created_at + timedelta(hours=duration)
        description = _format_description(issue_type, ward.name, duration)

        db.add(
            WaterComplaint(
                ward_id=ward.id,
                type=issue_type,
                description=description,
                status="resolved",
                created_at=created_at,
                resolved_at=resolved_at,
                resolution_comment=random.choice(RESOLUTION_TEMPLATES[issue_type]),
                assigned_team=random.choice(TEAMS),
                is_synthetic_seed=True,
            )
        )
        inserted += 1

    # Cluster batches (~5%)
    while cluster_inserted < cluster_target:
        ward = random.choices(wards, weights=ward_weights, k=1)[0]
        days_ago = random.randint(1, 365)
        base_time = now - timedelta(days=days_ago, hours=random.randint(6, 18))
        issue_type = _pick_issue_type(ward, base_time)
        batch_size = min(random.randint(2, 5), cluster_target - cluster_inserted)
        cluster_inserted += _generate_cluster_batch(db, ward, issue_type, base_time, batch_size)
        inserted += batch_size

    db.commit()
    return inserted


def _ward_supply_cycle_days(ward_id: int) -> int:
    """Deterministic rotation interval per ward (3–5 days)."""
    return 3 + (ward_id % 3)


def seed_historical_schedules(db: Session, *, force: bool = False) -> int:
    """
    Generate ~365 days of past water_schedules per ward.
    Skips if sufficient history already exists unless force=True.
    """
    wards = db.query(Ward).order_by(Ward.id).all()
    if not wards:
        return 0

    today = date.today()
    start = today - timedelta(days=HISTORICAL_SCHEDULE_DAYS)

    if not force:
        sample = (
            db.query(WaterSchedule)
            .filter(WaterSchedule.schedule_date <= today - timedelta(days=SCHEDULE_SEED_THRESHOLD_DAYS))
            .count()
        )
        if sample >= len(wards) * 50:
            return 0

    if force:
        db.query(WaterSchedule).filter(
            WaterSchedule.schedule_date < today,
        ).delete()
        db.commit()

    inserted = 0
    for ward in wards:
        cycle = _ward_supply_cycle_days(ward.id)
        last_supply: date | None = None
        population = max(ward.population or 10000, 5000)
        base_allocation = round(population * 0.8 + random.uniform(5000, 15000))

        current = start
        while current < today:
            days_since = (current - last_supply).days if last_supply else cycle + 1
            supply_today = days_since >= cycle or (days_since >= cycle - 1 and random.random() < 0.35)
            if supply_today:
                last_supply = current

            allocation = round(base_allocation * random.uniform(0.85, 1.15)) if supply_today else 0
            fairness = round(random.uniform(0.35, 0.95), 3) if supply_today else round(random.uniform(0.1, 0.4), 3)
            forced = supply_today and days_since >= 5

            duration = round(random.uniform(2.5, 4.5), 1) if supply_today else 0.0
            start_h = random.choice([5, 6, 7])
            db.add(
                WaterSchedule(
                    ward_id=ward.id,
                    schedule_date=current,
                    supply_today=supply_today,
                    allocation_litres=allocation,
                    duration_hours=duration,
                    supply_start_time=f"{start_h:02d}:00",
                    supply_end_time=f"{start_h + int(duration) + 1:02d}:00",
                    priority=random.choice(["high", "medium", "low"]) if supply_today else "low",
                    reasoning=(
                        f"Rotation day {cycle} — {'supply allocated' if supply_today else 'waiting for turn'}"
                    ),
                    fairness_score=fairness,
                    days_since_supply=days_since,
                    forced_supply=forced,
                    overridden=False,
                )
            )
            inserted += 1
            current += timedelta(days=1)

        if last_supply:
            ward.last_supply_date = last_supply

    db.commit()
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic historical water data")
    parser.add_argument("--force", action="store_true", help="Delete and regenerate synthetic data")
    parser.add_argument("--complaints-only", action="store_true")
    parser.add_argument("--schedules-only", action="store_true")
    parser.add_argument("--all", action="store_true", help="Generate complaints and schedules")
    args = parser.parse_args()

    run_complaints = args.complaints_only or args.all or (not args.complaints_only and not args.schedules_only)
    run_schedules = args.schedules_only or args.all

    db = SessionLocal()
    try:
        added = sync_ward_seed_data(db)
        if added:
            print(f"Synced {added} new wards from ward_seed_data.json")
        if run_complaints:
            n = seed_historical_complaints(db, force=args.force)
            print(f"Historical complaints: inserted {n} resolved records")
        if run_schedules:
            n = seed_historical_schedules(db, force=args.force)
            print(f"Historical schedules: inserted {n} past schedule rows")
    finally:
        db.close()


if __name__ == "__main__":
    main()
