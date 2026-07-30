"""Deterministic fair supply rotation scoring — explainable, no ML."""

from __future__ import annotations

from datetime import date

from app.models import Ward

# Max days a ward should wait between supplies (tune here).
TARGET_SUPPLY_GAP_DAYS = 4


def compute_fairness_score(ward: Ward, *, days_since_supply: int | None = None) -> float:
    """
    Higher score = higher scheduling priority.
    - overdue_ratio: how far past the target gap (days_since / limit)
    - complaints: active citizen pain (1.5× weight)
    - leakage_reports: infrastructure risk (1.0× weight)
    - houses/1000: population scale — more households affected (0.5× weight)
    """
    days = days_since_supply if days_since_supply is not None else (date.today() - ward.last_supply_date).days
    overdue_ratio = days / TARGET_SUPPLY_GAP_DAYS
    return (
        overdue_ratio * 10
        + ward.complaints * 1.5
        + ward.leakage_reports * 1.0
        + (ward.houses / 1000) * 0.5
    )


def is_forced_supply(ward: Ward, *, days_since_supply: int | None = None) -> bool:
    """Wards at or beyond the gap limit must receive supply today if water is available."""
    days = days_since_supply if days_since_supply is not None else (date.today() - ward.last_supply_date).days
    return days >= TARGET_SUPPLY_GAP_DAYS


def priority_label(score: float, forced: bool) -> str:
    if forced or score >= 12:
        return "High"
    if score >= 7:
        return "Medium"
    return "Low"
