"""Build ward_seed_data.json — run once: python -m app.data.build_ward_seed_data"""

from __future__ import annotations

import json
from pathlib import Path

# Real Bengaluru / BBMP neighbourhood names with approximate 2011 census baselines,
# zone tags, centroids, and optional complaint/leakage weights for realistic skew.
# Sources: BBMP ward delimitation, opencity.in BBMP dataset, Wikipedia ward pages.
WARD_ENTRIES = [
    # name, pop_2011, area_sq_km, lat, lng, zone, complaint_w, leakage_w
    ("Shivaji Nagar", 61203, 2.8, 12.9835, 77.6080, "Central", 1.4, 1.6),
    ("Koramangala", 55124, 3.1, 12.9352, 77.6245, "South-East", 1.2, 1.1),
    ("Indiranagar", 48932, 2.5, 12.9784, 77.6408, "East", 1.0, 1.0),
    ("Whitefield", 42156, 4.2, 12.9698, 77.7499, "East", 1.3, 1.2),
    ("Jayanagar", 58932, 3.4, 12.9250, 77.5938, "South", 1.0, 1.0),
    ("Malleshwaram", 48752, 2.3, 12.9980, 77.5700, "North-West", 0.9, 0.9),
    ("Rajajinagar", 62415, 3.0, 12.9910, 77.5520, "West", 1.1, 1.2),
    ("BTM Layout", 67234, 3.6, 12.9166, 77.6101, "South", 1.5, 1.4),
    ("Hebbal", 45821, 3.8, 13.0358, 77.5970, "North", 1.2, 1.1),
    ("Yelahanka", 39102, 5.1, 13.1007, 77.5963, "North", 1.1, 1.0),
    ("Electronic City", 38245, 6.2, 12.8456, 77.6603, "South-East", 1.3, 1.1),
    ("Marathahalli", 51342, 4.5, 12.9591, 77.6974, "East", 1.4, 1.3),
    ("Banashankari", 63421, 3.9, 12.9255, 77.5468, "South", 1.2, 1.2),
    ("Vijayanagar", 52103, 3.2, 12.9710, 77.5370, "West", 1.1, 1.1),
    ("HSR Layout", 58234, 3.5, 12.9116, 77.6389, "South-East", 1.1, 1.0),
    ("Frazer Town", 38210, 1.9, 12.9985, 77.6120, "Central", 1.3, 1.5),
    ("Basavanagudi", 49876, 2.7, 12.9420, 77.5735, "South", 1.0, 1.1),
    ("JP Nagar", 69812, 4.1, 12.9068, 77.5850, "South", 1.1, 1.0),
    ("Bellandur", 44623, 5.8, 12.9352, 77.6785, "East", 1.3, 1.2),
    ("Sarjapur", 31245, 7.2, 12.8618, 77.7834, "South-East", 1.0, 1.0),
    ("Yeshwanthpur", 89234, 4.6, 13.0284, 77.5368, "North-West", 1.6, 1.5),
    ("Peenya", 78432, 5.4, 13.0280, 77.5180, "North-West", 1.7, 1.6),
    ("Nagarbhavi", 52341, 4.0, 12.9720, 77.5080, "West", 1.3, 1.3),
    ("Kengeri", 41230, 5.5, 12.9060, 77.4820, "West", 1.2, 1.2),
    ("Mahalakshmi Layout", 45678, 3.2, 13.0150, 77.5480, "North-West", 1.1, 1.2),
    ("RT Nagar", 38901, 2.8, 13.0200, 77.5950, "North", 1.2, 1.1),
    ("Cox Town", 35670, 2.1, 12.9980, 77.6220, "Central", 1.4, 1.5),
    ("Ulsoor", 42100, 2.4, 12.9830, 77.6220, "Central", 1.2, 1.3),
    ("Domlur", 44560, 2.6, 12.9600, 77.6380, "East", 1.1, 1.0),
    ("Benson Town", 33450, 1.8, 12.9980, 77.6050, "Central", 1.3, 1.4),
    ("Wilson Garden", 51230, 2.9, 12.9500, 77.5980, "South", 1.4, 1.3),
    ("Bilekahalli", 47890, 3.5, 12.9000, 77.6100, "South", 1.3, 1.2),
    ("Bommanahalli", 55670, 4.2, 12.8950, 77.6250, "South-East", 1.5, 1.4),
    ("Hongasandra", 38900, 3.8, 12.8850, 77.6400, "South-East", 1.4, 1.3),
    ("Gottigere", 34560, 4.5, 12.8600, 77.5900, "South", 1.2, 1.1),
    ("Uttarahalli", 56780, 4.8, 12.9050, 77.5500, "South", 1.3, 1.2),
    ("Padmanabhanagar", 48900, 3.3, 12.9180, 77.5600, "South", 1.1, 1.0),
    ("Chamarajpet", 52340, 2.5, 12.9580, 77.5680, "Central", 1.5, 1.6),
    ("Chickpet", 61200, 1.6, 12.9670, 77.5770, "Central", 1.8, 1.7),
    ("Majestic", 58400, 1.4, 12.9770, 77.5710, "Central", 1.6, 1.5),
    ("Seshadripuram", 41200, 2.0, 12.9900, 77.5800, "Central", 1.3, 1.4),
    ("Sadashivanagar", 28900, 2.2, 13.0100, 77.5780, "North", 0.8, 0.9),
    ("Kammanahalli", 45600, 2.4, 13.0150, 77.6380, "East", 1.2, 1.1),
    ("Kalyan Nagar", 52300, 3.0, 13.0280, 77.6450, "East", 1.1, 1.0),
    ("Hoodi", 38900, 3.2, 12.9880, 77.7280, "East", 1.3, 1.2),
    ("Varthur", 35600, 4.0, 12.9380, 77.7480, "East", 1.2, 1.3),
    ("KR Puram", 67800, 4.5, 13.0200, 77.6950, "East", 1.4, 1.3),
    ("Mahadevapura", 54300, 4.8, 12.9910, 77.6950, "East", 1.3, 1.2),
    ("Nagawara", 48900, 3.6, 13.0450, 77.6250, "North", 1.5, 1.4),
    ("Thanisandra", 41200, 4.2, 13.0600, 77.6350, "North", 1.3, 1.2),
    ("Hennur", 37800, 3.8, 13.0350, 77.6550, "North-East", 1.2, 1.1),
    ("Jalahalli", 56700, 4.0, 13.0480, 77.5480, "North-West", 1.4, 1.3),
    ("Mathikere", 61200, 3.5, 13.0330, 77.5620, "North-West", 1.3, 1.2),
    ("Sanjay Nagar", 34500, 2.5, 13.0250, 77.5750, "North", 0.9, 0.9),
    ("Vidyaranyapura", 42300, 4.5, 13.0780, 77.5550, "North", 1.1, 1.0),
    ("Jakkur", 28900, 5.0, 13.0680, 77.6050, "North", 1.0, 1.0),
    ("Horamavu", 33400, 4.2, 13.0200, 77.6650, "North-East", 1.2, 1.1),
    ("Kadugodi", 30100, 3.5, 12.9950, 77.7600, "East", 1.2, 1.1),
    ("Richmond Town", 25600, 1.5, 12.9680, 77.6020, "Central", 1.1, 1.2),
    ("Austin Town", 31200, 1.7, 12.9620, 77.6080, "Central", 1.4, 1.5),
]


def _polygon(lat: float, lng: float, size: float = 0.012) -> list:
    return [
        [lng - size, lat - size],
        [lng + size, lat - size],
        [lng + size, lat + size],
        [lng - size, lat + size],
        [lng - size, lat - size],
    ]


def build() -> dict:
    wards = []
    for name, pop, area, lat, lng, zone, cw, lw in WARD_ENTRIES:
        wards.append({
            "name": name,
            "population_2011": pop,
            "area_sq_km": area,
            "lat": lat,
            "lng": lng,
            "zone": zone,
            "complaint_weight": cw,
            "leakage_weight": lw,
            "polygon": _polygon(lat, lng),
        })
    return {
        "_note": (
            "2011 BBMP ward census baselines. Sources: BBMP ward delimitation documents, "
            "opencity.in BBMP ward dataset, and ward Wikipedia pages. "
            "Projected forward at seed time — not live official data."
        ),
        "census_base_year": 2011,
        "annual_growth_rate": 0.021,
        "household_divisor": 4.7,
        "wards": wards,
    }


def main() -> None:
    path = Path(__file__).resolve().parent / "ward_seed_data.json"
    data = build()
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {len(data['wards'])} wards to {path}")


if __name__ == "__main__":
    main()
