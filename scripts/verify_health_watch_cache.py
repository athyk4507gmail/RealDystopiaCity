"""
verify_health_watch_cache.py
----------------------------
Checks all 20 ward Gemma cache entries for corrupted/prompt-echo content.

A "corrupted" entry is one where the explanation or intervention field
contains raw prompt structure rather than plain prose — the signature of
the bug where Gemma echoed back the combined system+user prompt.

Exit codes:
  0 — all wards clean
  1 — backend unreachable or no wards loaded
  2 — one or more corrupted entries found

Usage:
    python scripts/verify_health_watch_cache.py

Run after warm_health_watch_cache.py to confirm all entries are clean.
"""

import asyncio
import sys
from datetime import datetime

import httpx

BASE_URL  = "http://localhost:8000"
TIMEOUT_S = 30

# Same detection signatures as the backend _is_prompt_echo check.
CORRUPTION_SIGNATURES = (
    "you are explaining",
    "you never diagnose",
    "you suggest concrete",
    "constraint 1",
    "constraint 2",
    "constraint 3",
    "constraint 4",
    "input data:",
    "given the following ward data",
    "- ward:",
    "- stagnant water reports",
    "system:",
    "user:",
    "role:",
)


def is_corrupted(text: str) -> bool:
    """Return True if text contains prompt-echo signatures."""
    lower = (text or "").lower().strip()
    head = lower[:400]
    return any(sig in head for sig in CORRUPTION_SIGNATURES)


def check_entry(ward_id: int, ward_name: str, gemma: dict | None) -> list[str]:
    """Return a list of issue descriptions for this ward's Gemma entry."""
    issues = []
    if gemma is None:
        issues.append("gemma is null — not yet cached")
        return issues
    explanation  = gemma.get("explanation", "")
    intervention = gemma.get("intervention", "")
    if not explanation:
        issues.append("explanation is empty")
    elif is_corrupted(explanation):
        issues.append(f"explanation contains prompt-echo — first 120 chars: {explanation[:120]!r}")
    if not intervention:
        issues.append("intervention is empty")
    elif is_corrupted(intervention):
        issues.append(f"intervention contains prompt-echo — first 120 chars: {intervention[:120]!r}")
    return issues


async def main() -> int:
    print(f"\n{'='*64}")
    print(f"  CityPulse — Health Watch cache integrity check")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*64}\n")

    async with httpx.AsyncClient() as client:
        # Health check
        try:
            hc = await client.get(f"{BASE_URL}/api/health", timeout=5)
            hc.raise_for_status()
            print(f"  Backend: {BASE_URL} ✓\n")
        except Exception as exc:
            print(f"  ERROR: Backend unreachable — {exc}")
            return 1

        # Fetch all ward detail endpoints (these hit the cache or Gemma)
        try:
            wards_resp = await client.get(f"{BASE_URL}/api/health-watch/wards", timeout=TIMEOUT_S)
            wards_resp.raise_for_status()
            wards = wards_resp.json()
        except Exception as exc:
            print(f"  ERROR: Could not fetch ward list — {exc}")
            return 1

        print(f"  Checking {len(wards)} wards...\n")

        corrupted = []
        clean     = []
        uncached  = []

        for w in sorted(wards, key=lambda x: x["ward_id"]):
            wid   = w["ward_id"]
            wname = w["ward_name"]
            try:
                detail_resp = await client.get(
                    f"{BASE_URL}/api/health-watch/wards/{wid}",
                    timeout=TIMEOUT_S,
                )
                detail_resp.raise_for_status()
                detail = detail_resp.json()
            except Exception as exc:
                print(f"  [{wid:>2}] {wname:<20} ✗ fetch failed: {exc}")
                corrupted.append((wid, wname, [f"fetch failed: {exc}"]))
                continue

            gemma  = detail.get("gemma")
            issues = check_entry(wid, wname, gemma)

            if not issues:
                expl_preview = (gemma.get("explanation") or "")[:80]
                gen_at = gemma.get("generated_at", "")[:16] if gemma else ""
                print(f"  [{wid:>2}] {wname:<20} ✓  \"{expl_preview}…\"  [{gen_at}]")
                clean.append(wid)
            elif issues == ["gemma is null — not yet cached"]:
                print(f"  [{wid:>2}] {wname:<20} ⚪ not cached yet")
                uncached.append(wid)
            else:
                for issue in issues:
                    print(f"  [{wid:>2}] {wname:<20} ✗ CORRUPTED: {issue}")
                corrupted.append((wid, wname, issues))

    # Summary
    print(f"\n{'='*64}")
    print(f"  RESULTS")
    print(f"{'='*64}")
    print(f"  Clean     : {len(clean)}")
    print(f"  Not cached: {len(uncached)}")
    print(f"  Corrupted : {len(corrupted)}")

    if corrupted:
        print(f"\n  Corrupted wards — run warm script with --force to fix:")
        for wid, wname, issues in corrupted:
            print(f"    Ward {wid} ({wname}):")
            for issue in issues:
                print(f"      - {issue}")
        print(f"\n  Fix: python scripts/warm_health_watch_cache.py --force")
        print(f"{'='*64}\n")
        return 2

    if uncached:
        print(f"\n  Uncached wards: {uncached}")
        print(f"  Run: python scripts/warm_health_watch_cache.py")

    print(f"\n  All cached entries are clean. ✓")
    print(f"{'='*64}\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
