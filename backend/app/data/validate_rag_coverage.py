"""
Validate RAG coverage: resolved complaints per (ward, issue_type).

Run from backend/:
  python -m app.data.validate_rag_coverage
"""

from __future__ import annotations

from collections import defaultdict

from app.data.complaint_templates import COMPLAINT_TYPES
from app.database import SessionLocal
from app.models import Ward, WaterComplaint


def validate_rag_coverage() -> dict:
    db = SessionLocal()
    try:
        wards = db.query(Ward).order_by(Ward.name).all()
        ward_names = {w.id: w.name for w in wards}

        counts: dict[tuple[str, str], int] = defaultdict(int)
        rows = (
            db.query(WaterComplaint.ward_id, WaterComplaint.type)
            .filter(WaterComplaint.status == "resolved")
            .all()
        )
        for ward_id, issue_type in rows:
            name = ward_names.get(ward_id, f"ward#{ward_id}")
            counts[(name, issue_type)] += 1

        buckets = {"0": 0, "1-2": 0, "3+": 0}
        zero_pairs: list[tuple[str, str]] = []
        low_pairs: list[tuple[str, str]] = []

        for ward in wards:
            for issue_type in COMPLAINT_TYPES:
                n = counts.get((ward.name, issue_type), 0)
                if n == 0:
                    buckets["0"] += 1
                    zero_pairs.append((ward.name, issue_type))
                elif n <= 2:
                    buckets["1-2"] += 1
                    low_pairs.append((ward.name, issue_type))
                else:
                    buckets["3+"] += 1

        total_pairs = len(wards) * len(COMPLAINT_TYPES)
        total_resolved = len(rows)

        print("=" * 60)
        print("RAG COVERAGE VALIDATION")
        print("=" * 60)
        print(f"Wards: {len(wards)}")
        print(f"Issue types: {len(COMPLAINT_TYPES)} ({', '.join(COMPLAINT_TYPES)})")
        print(f"Total (ward, type) pairs: {total_pairs}")
        print(f"Total resolved complaints: {total_resolved}")
        print()
        print("Coverage summary:")
        for label, count in buckets.items():
            pct = 100 * count / total_pairs if total_pairs else 0
            print(f"  {label:>4} records: {count:4d} pairs ({pct:5.1f}%)")
        print()

        if zero_pairs:
            print(f"FLAG — {len(zero_pairs)} pairs with ZERO records:")
            for name, itype in sorted(zero_pairs)[:30]:
                print(f"  - {name} / {itype}")
            if len(zero_pairs) > 30:
                print(f"  ... and {len(zero_pairs) - 30} more")
            print()

        if low_pairs:
            print(f"NOTE — {len(low_pairs)} pairs with only 1-2 records (honest fallback will trigger)")

        print()
        print("Per-ward totals (resolved):")
        ward_totals = defaultdict(int)
        for (name, _), n in counts.items():
            ward_totals[name] += n
        for name in sorted(ward_totals, key=lambda x: -ward_totals[x])[:15]:
            print(f"  {name:25s} {ward_totals[name]:4d}")
        if len(ward_totals) > 15:
            print(f"  ... {len(ward_totals) - 15} more wards")

        return {
            "buckets": buckets,
            "total_pairs": total_pairs,
            "total_resolved": total_resolved,
            "zero_pairs": zero_pairs,
        }
    finally:
        db.close()


if __name__ == "__main__":
    validate_rag_coverage()
