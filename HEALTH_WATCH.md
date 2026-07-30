# Health Watch Module — CityPulse

> Ward-level environmental risk signal for municipal planning.
> **Not a medical diagnostic tool.** Does not diagnose individuals or detect disease in specific people.

---

## What it does

Public Health Early-Warning (`/health-watch`) correlates existing infrastructure and environment
data into a transparent, explainable risk score per Bengaluru ward. A city official can:

- See all 20 wards coloured by risk on a live map (green → amber → red)
- Read a city-wide horizontal bar chart for an at-a-glance ranking of all wards
- Spot wards trending upward this week via a pulsing ring animation and a top banner
- Search, filter (Trending up / High risk), and sort the ward list
- Compare 2–3 wards side by side with Gemma explanations for each
- Drill into any ward for the full formula breakdown, contributing inputs with freshness badges,
  a 7-day sparkline, and a concrete recommended action from Gemma

---

## Risk formula

```
risk_score = (stagnant_reports_norm × 0.30)
           + (heat_index_norm        × 0.25)
           + (complaint_density_norm × 0.25)
           + (metabolism_stress_norm × 0.20)
```

Each input is normalised 0–1 against a reference ceiling:

| Input | Weight | Ceiling (→ 1.0) | Notes |
|-------|--------|-----------------|-------|
| Stagnant water reports (7d) | 30% | 15 reports | Rolling 7-day count per ward |
| Heat index (temp anomaly above 28°C) | 25% | +6°C anomaly | Seasonal norm = 28°C. Humidity correction only applied when anomaly > 0 — never inflates cool+humid days. |
| Health-tagged complaints (7d) | 25% | 20 complaints | Categories: fever, mosquito, drainage_overflow, garbage_water_mix, water_borne |
| Metabolism water stress | 20% | −30% water delta | Positive delta (supply improving) contributes 0 — no false signal |

All raw inputs, normalised values, weights, and the formula string are exposed in the API
response so the frontend can render "How is this calculated?" transparently.

---

## Data inputs tonight

| Input | Source | Tag | Swap tomorrow |
|-------|--------|-----|---------------|
| Temperature, humidity | OpenWeather (live) | `live` | No change needed |
| City Metabolism water pressure | Metabolism module localhost:8000 | `live` | No change needed |
| Stagnant water reports | Fixture `backend/app/fixtures/stagnant_water_reports.json` | `reported` | One-line swap — see below |
| Health complaints | Fixture `backend/app/fixtures/health_complaints.json` | `reported` | One-line swap — see below |

---

## Tomorrow morning: swapping the mock fetchers

Both fetchers are isolated in `backend/app/services/health_watch.py`. No other code reads
the fixtures directly — the swap is contained to these two functions.

**`getStagnantWaterReports(ward_id)`** — replace the function body with:
```python
# TOMORROW: replace fixture read with real API call once Water Distribution merges
return await api_client.water.stagnant_reports(ward_id, days=7)
```
Expected return shape (matches the fixture exactly):
```json
{ "ward_id": 1, "ward_name": "Shivaji Nagar", "stagnant_reports_7d": 3, "last_reported_at": "2026-07-26" }
```

**`getHealthTaggedComplaints(ward_id)`** — replace the function body with:
```python
# TOMORROW: replace fixture read with real API call once Complaints merges
return await api_client.complaints.health_tagged(ward_id, days=7)
```
Expected return shape (matches the fixture exactly):
```json
{ "ward_id": 1, "ward_name": "Shivaji Nagar", "complaint_count_7d": 4, "categories": {"mosquito": 2, "drainage_overflow": 2} }
```

---

## City Metabolism cross-link (live tonight)

`get_metabolism_stress()` in `backend/app/services/health_watch.py` calls
`GET /api/metabolism/vitals` on the running Metabolism module and reads `water_pressure`
(0–100 scale, 70 = healthy baseline):

```python
water_delta = round(water_pct - 70.0, 1)   # e.g. pressure=50% → delta = -20.0
```

Thresholds:
- `water_pressure < 55` → `active_stress_test = "active"`, delta fed into formula
- `water_pressure 55–65` → `active_stress_test = "elevated"`, smaller delta
- `water_pressure ≥ 65` → no stress signal, contributes 0 to score

The ward detail panel surfaces this explicitly: *"Active stress: active — water supply down
20%"* with a `live` badge and a "View ↗" link back to `/metabolism`.

If the Metabolism module is unreachable, the cross-link strip shows
*"Metabolism data unavailable — not contributing to score"* and the component contributes 0.

---

## Gemma reasoning

Two separate prompts per ward, run **concurrently** via `asyncio.gather`:

- **Call 1 (causal)**: 2 sentences explaining why the ward's environmental risk is elevated or
  low, referencing specific factors (stagnant reports, temp anomaly, complaints, metabolism
  stress test if active)
- **Call 2 (intervention)**: the single most cost-effective municipal action this week —
  specific and concrete, not generic

Both calls are cached per ward per calendar day using key `f"{ward_id}:{date.today()}"`.

- First click per ward: ~15–25 s (parallel Gemma calls, down from ~30–40 s sequential)
- Repeat clicks: near-instant (cache hit)

`generated_at` (ISO timestamp) and `gemma_elapsed_ms` are stored in the cache and shown in
the UI as *"Generated 4m ago · 18234ms"*.

If Gemma fails, `gemma_error` is set in the response and the frontend shows a red error card
with a Retry button — no infinite spinner, no silent blank panel.

---

## Pre-warming the cache before a demo

```bash
cd backend
.venv/Scripts/python ../scripts/warm_health_watch_cache.py
```

This calls all 20 ward detail endpoints with concurrency=3, printing progress:

```
============================================================
  CityPulse — Health Watch cache warm-up
  2026-07-28 21:00:00  |  concurrency=3
============================================================
  Backend: http://localhost:8000 ✓
  Fetching ward list... 20 wards found.
  Checking cache status... 0 already warmed today, 0 will be skipped.

  Warming 20 wards (skipping 0):

  [ 1/20] Warming Shivaji Nagar (id=1)...  ✓ 18234ms (Gemma 18180ms)
  [ 2/20] Warming Koramangala (id=2)...    ✓ 312ms (cached)
  ...
============================================================
  SUMMARY
  Total wards : 20
  Warmed      : 20
  Skipped     : 0
  Wall time   : 142s
============================================================
```

Wards already cached for today are skipped automatically. Use `--force` to re-warm all.

---

## Running backend tests

```bash
cd backend
.venv/Scripts/pip install pytest pytest-asyncio --quiet   # first time only
.venv/Scripts/python -m pytest tests/test_health_watch.py -v
```

Tests cover:

| Test | What it verifies |
|------|-----------------|
| `test_risk_score_all_zero` | All-zero inputs → score = 0.0 |
| `test_risk_score_max_inputs` | Ceiling inputs → score = 100.0 |
| `test_risk_score_stagnant_only` | Stagnant at ceiling only → score = weight × 100 |
| `test_heat_index_zero_anomaly_basavanagudi` | **Regression**: 22.6°C + 75% humidity → 0 (humidity phantom bug) |
| `test_heat_index_zero_anomaly_at_norm` | Exactly at 28°C → 0 even with high humidity |
| `test_heat_index_above_norm` | 31°C (3°C anomaly) → normalised = 0.5 |
| `test_heat_index_humidity_only_applies_above_baseline` | Humidity bonus only above baseline temp |
| `test_gemma_cache_key_per_ward` | **Regression**: keys differ between wards (was the stale-state root cause) |
| `test_gemma_cache_key_includes_today` | Key expires daily |
| `test_metabolism_positive_delta_no_risk` | Positive delta contributes 0 |
| `test_score_formula_string_present` | Formula string present in API response |

---

## Architecture notes

| Concern | Solution |
|---------|----------|
| Race condition on rapid ward switching | `inflightRef` in `selectWard` — stamps current ward ID before each async fetch; response handlers check `inflightRef.current === wardId` before `setDetail`. Stale out-of-order responses discarded silently. |
| Stale Gemma text after ward switch | `GemmaSection` renders only when `detail.ward_id === wardId` — belt-and-suspenders guard in addition to inflightRef. |
| Heat-index phantom inflation on cool+humid days | `_compute_heat_index_norm` only applies humidity correction when `anomaly > 0`. See `test_heat_index_zero_anomaly_basavanagudi`. |
| Loud fixture errors in dev | `_load_fixture()` raises `FileNotFoundError`/`ValueError` with a clear message pointing to the fixture path if missing or malformed — fails fast, not silently. |
| Metabolism N+1 HTTP calls | `get_metabolism_stress()` fetched once per refresh cycle, result passed into all 20 `compute_ward_health()` calls. |
| Gemma latency | Two calls run concurrently via `asyncio.gather`. Timing printed to console on every cache miss. |

---

## File map

```
backend/
  app/
    routers/health_watch.py              # GET /wards, GET /wards/{id}, POST /refresh, GET /cache-status
    services/health_watch.py             # scoring, Gemma, Metabolism integration, mock fetchers
    fixtures/
      stagnant_water_reports.json        # TEMP: swap for Water Distribution API call
      health_complaints.json             # TEMP: swap for Complaints API call
  tests/
    __init__.py
    test_health_watch.py                 # 11 unit + regression tests

scripts/
  warm_health_watch_cache.py             # Pre-demo Gemma cache warm-up, --force flag

frontend/
  src/
    app/health-watch/page.tsx            # Map, chart, list, compare, detail, Gemma section
    lib/api.ts                           # HealthWatch* TypeScript interfaces + api.healthWatch
    components/Sidebar.tsx               # /health-watch nav entry (HeartPulse, text-rose-400)
    app/globals.css                      # .trend-up-pulse, .animate-fade-in keyframes
```
