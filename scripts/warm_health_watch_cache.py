"""
warm_health_watch_cache.py
--------------------------
Pre-warms the Gemma cache for all health-watch wards by calling
GET /api/health-watch/wards/{id} for every ward, 3 at a time.

Usage:
    python scripts/warm_health_watch_cache.py           # skip already-cached wards
    python scripts/warm_health_watch_cache.py --force   # re-warm even if already cached

Run this manually before any demo so first-click latency on the frontend
is near-instant (cache hit) rather than 20-40s (live Gemma calls).

Requirements: Python 3.10+, httpx (already in backend/requirements.txt).
Run from the repo root or from the backend directory — both work.
"""

import argparse
import asyncio
import sys
import time
from datetime import datetime

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL     = "http://localhost:8000"
CONCURRENCY  = 3       # parallel requests — don't hammer Gemma / rate limits
TIMEOUT_S    = 90      # per-ward timeout; Gemma can take 30-45s cold


async def fetch_cache_status(client: httpx.AsyncClient) -> set[int]:
    """Return the set of ward IDs already cached for today."""
    try:
        r = await client.get(f"{BASE_URL}/api/health-watch/cache-status", timeout=10)
        r.raise_for_status()
        return set(r.json().get("warmed_ward_ids", []))
    except Exception as exc:
        print(f"  [warn] Could not fetch cache-status: {exc}")
        return set()


async def fetch_ward_list(client: httpx.AsyncClient) -> list[dict]:
    """Fetch the list of all ward IDs and names."""
    r = await client.get(f"{BASE_URL}/api/health-watch/wards", timeout=30)
    r.raise_for_status()
    return r.json()


async def warm_ward(
    client: httpx.AsyncClient,
    ward_id: int,
    ward_name: str,
    idx: int,
    total: int,
    sem: asyncio.Semaphore,
) -> dict:
    """Fetch detail for one ward (triggers Gemma + caches it). Returns result dict."""
    async with sem:
        t0 = time.perf_counter()
        print(f"  [{idx:>2}/{total}] Warming {ward_name} (id={ward_id})...", end="", flush=True)
        try:
            r = await client.get(
                f"{BASE_URL}/api/health-watch/wards/{ward_id}",
                timeout=TIMEOUT_S,
            )
            r.raise_for_status()
            data = r.json()
            elapsed = round((time.perf_counter() - t0) * 1000)
            gemma_ms = data.get("gemma", {}) or {}
            gemma_ms = gemma_ms.get("gemma_elapsed_ms", "?") if isinstance(gemma_ms, dict) else "?"
            cached = data.get("gemma") is not None
            tag = "cached" if elapsed < 500 else f"Gemma {gemma_ms}ms"
            print(f" ✓ {elapsed}ms ({tag})")
            return {"ward_id": ward_id, "ward_name": ward_name, "ok": True, "elapsed_ms": elapsed}
        except httpx.TimeoutException:
            elapsed = round((time.perf_counter() - t0) * 1000)
            print(f" ✗ TIMEOUT after {elapsed}ms")
            return {"ward_id": ward_id, "ward_name": ward_name, "ok": False, "error": "timeout", "elapsed_ms": elapsed}
        except Exception as exc:
            elapsed = round((time.perf_counter() - t0) * 1000)
            print(f" ✗ ERROR: {exc}")
            return {"ward_id": ward_id, "ward_name": ward_name, "ok": False, "error": str(exc), "elapsed_ms": elapsed}


async def main(force: bool) -> int:
    print(f"\n{'='*60}")
    print(f"  CityPulse — Health Watch cache warm-up")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  |  concurrency={CONCURRENCY}")
    print(f"{'='*60}")

    t_start = time.perf_counter()

    async with httpx.AsyncClient() as client:
        # 1. Health check
        try:
            hc = await client.get(f"{BASE_URL}/api/health", timeout=5)
            hc.raise_for_status()
            print(f"  Backend: {BASE_URL} ✓")
        except Exception as exc:
            print(f"\n  ERROR: Backend not reachable at {BASE_URL}\n  {exc}")
            print("  Start the backend first: cd backend && .venv/Scripts/uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000")
            return 1

        # 2. Get ward list
        print("  Fetching ward list...", end="", flush=True)
        try:
            wards = await fetch_ward_list(client)
            print(f" {len(wards)} wards found.")
        except Exception as exc:
            print(f"\n  ERROR fetching wards: {exc}")
            return 1

        # 3. Check which wards are already cached
        already_cached: set[int] = set()
        if not force:
            print("  Checking cache status...", end="", flush=True)
            already_cached = await fetch_cache_status(client)
            skip_count = sum(1 for w in wards if w["ward_id"] in already_cached)
            print(f" {len(already_cached)} already warmed today, {skip_count} will be skipped.")
        else:
            print("  --force: re-warming all wards regardless of cache.")

        # 4. Determine which wards to warm
        to_warm = [w for w in wards if force or w["ward_id"] not in already_cached]

        if not to_warm:
            print("\n  All wards already cached for today. Nothing to do.")
            print("  Pass --force to re-warm anyway.\n")
            return 0

        print(f"\n  Warming {len(to_warm)} wards (skipping {len(wards) - len(to_warm)}):\n")

        # 5. Warm with bounded concurrency
        sem = asyncio.Semaphore(CONCURRENCY)
        tasks = [
            warm_ward(client, w["ward_id"], w["ward_name"], idx + 1, len(to_warm), sem)
            for idx, w in enumerate(to_warm)
        ]
        results = await asyncio.gather(*tasks)

    # 6. Summary
    total_elapsed = round(time.perf_counter() - t_start)
    ok      = [r for r in results if r["ok"]]
    failed  = [r for r in results if not r["ok"]]
    skipped = len(wards) - len(to_warm)

    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"{'='*60}")
    print(f"  Total wards : {len(wards)}")
    print(f"  Warmed      : {len(ok)}")
    print(f"  Skipped     : {skipped} (already cached)")
    print(f"  Failed      : {len(failed)}")
    print(f"  Wall time   : {total_elapsed}s")

    if ok:
        avg_ms = round(sum(r["elapsed_ms"] for r in ok) / len(ok))
        print(f"  Avg latency : {avg_ms}ms per ward (includes Gemma for cold misses)")

    if failed:
        print(f"\n  Failed wards:")
        for r in failed:
            print(f"    - {r['ward_name']} (id={r['ward_id']}): {r['error']}")
        print(f"\n  Re-run to retry failed wards, or use --force to re-warm all.")

    print(f"{'='*60}\n")
    return 0 if not failed else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pre-warm health-watch Gemma cache")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-warm all wards even if already cached for today",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.force)))
