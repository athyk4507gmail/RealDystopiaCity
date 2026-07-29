import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from app.config import settings
from app.services.cache import get_cached, set_cached
from app.services.live_signal_logic import compute_live_signal
from app.services.vision import analyze_frame

logger = logging.getLogger(__name__)

LIVE_CAMERA_CANDIDATES = [
    {
        "slug": "i1011woarchibaldave",
        "source": "Caltrans D8 - I-10 west of Archibald Ave, San Bernardino County, California",
    },
    {
        "slug": "i1012westofhaven",
        "source": "Caltrans D8 - I-10 west of Haven Ave, San Bernardino County, California",
    },
    {
        "slug": "i1004bensonavenue",
        "source": "Caltrans D8 - I-10 Benson Ave, San Bernardino County, California",
    },
]
_active_camera_index = 0
_request_headers = {"User-Agent": "CityPulse-CommandSignal/1.0 (+local demo)"}

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
LIVE_CAMERA_IMAGE = STATIC_DIR / "live_camera_latest.jpg"

POLL_INTERVAL_SECONDS = 12
FETCH_TIMEOUT_SECONDS = 15

_live_state: dict[str, Any] = {
    "camera_source": LIVE_CAMERA_CANDIDATES[0]["source"],
    "vehicle_count": 0,
    "person_count": 0,
    "detections": [],
    "green_seconds": 30,
    "red_seconds": 30,
    "status": "Light",
    "explanation": "Waiting for first live camera fetch…",
    "image_last_updated": None,
    "annotated_image_url": "/static/live_camera_latest.jpg",
    "fetch_error": None,
    "error": None,
    "night_mode": False,
    "frame_brightness": None,
}


def _camera_url(slug: str) -> str:
    return f"https://cwwp2.dot.ca.gov/data/d8/cctv/image/{slug}/{slug}.jpg"


def _attempt_download(url: str, verify_ssl: bool) -> bytes:
    resp = httpx.get(
        url,
        timeout=FETCH_TIMEOUT_SECONDS,
        follow_redirects=True,
        verify=verify_ssl,
        headers=_request_headers,
    )
    resp.raise_for_status()
    if not resp.content or len(resp.content) < 1000:
        raise RuntimeError(f"empty_or_tiny_image bytes={len(resp.content)}")
    content_type = (resp.headers.get("content-type") or "").lower()
    if "image" not in content_type and not resp.content[:3] == b"\xff\xd8\xff":
        raise RuntimeError(f"unexpected_content_type={content_type}")
    return resp.content


def _structured_error(detail: str, slug: str, url: str) -> dict[str, Any]:
    return {
        "error": "caltrans_unreachable",
        "detail": detail,
        "slug": slug,
        "url": url,
        "timestamp": datetime.utcnow().isoformat(),
    }


def _log_fetch_failure(slug: str, url: str, exc: Exception, stage: str) -> None:
    status_code = None
    headers = None
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        headers = dict(exc.response.headers)
    logger.error(
        "Caltrans camera fetch failed [%s] type=%s message=%s slug=%s url=%s status=%s headers=%s",
        stage,
        type(exc).__name__,
        str(exc),
        slug,
        url,
        status_code,
        headers,
    )


def _download_camera_image() -> tuple[bytes, dict[str, str]]:
    """
    Fetch one camera JPEG.
    On ANY fetch exception (TLS/handshake, timeout, HTTP, etc.), retry with
    verify=False then rotate to the next fallback slug.
    """
    global _active_camera_index
    failures: list[str] = []
    total = len(LIVE_CAMERA_CANDIDATES)

    for offset in range(total):
        idx = (_active_camera_index + offset) % total
        candidate = LIVE_CAMERA_CANDIDATES[idx]
        slug = candidate["slug"]
        url = _camera_url(slug)
        try:
            try:
                content = _attempt_download(url, verify_ssl=settings.http_ssl_verify)
            except Exception as ssl_exc:
                # Covers ConnectError, SSLError, TimeoutException, and Windows
                # revocation/handshake failures that surface as RequestError.
                if settings.http_ssl_verify:
                    _log_fetch_failure(slug, url, ssl_exc, "ssl_verify_true")
                    logger.warning(
                        "Retrying Caltrans fetch with verify=False after %s: %s",
                        type(ssl_exc).__name__,
                        ssl_exc,
                    )
                    content = _attempt_download(url, verify_ssl=False)
                else:
                    raise
            _active_camera_index = idx
            logger.info(
                "Live camera fetch OK slug=%s bytes=%s",
                slug,
                len(content),
            )
            return content, candidate
        except Exception as exc:
            # ANY failure (TLS, timeout, HTTP, empty body) rotates to next slug.
            detail = f"{type(exc).__name__}: {exc}"
            if isinstance(exc, httpx.HTTPStatusError):
                detail = f"http_status={exc.response.status_code}"
            failures.append(f"{slug}:{detail}")
            _log_fetch_failure(slug, url, exc, "slug_exhausted")
            continue

    detail = "; ".join(failures) if failures else "unknown fetch failure"
    first = LIVE_CAMERA_CANDIDATES[_active_camera_index]
    raise RuntimeError(
        json.dumps(_structured_error(detail, first["slug"], _camera_url(first["slug"])))
    )


def fetch_and_analyze_live_camera() -> dict[str, Any]:
    """Fetch the current frame from the public camera and run detection."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    image_bytes, camera = _download_camera_image()
    LIVE_CAMERA_IMAGE.write_bytes(image_bytes)

    result = analyze_frame(str(LIVE_CAMERA_IMAGE), low_light_assist=True)
    signal = compute_live_signal(result["vehicle_count"])
    timestamp = datetime.utcnow().isoformat()

    state = {
        "camera_source": camera["source"],
        "vehicle_count": result["vehicle_count"],
        "person_count": result["person_count"],
        "detections": result["detections"],
        "green_seconds": signal["green_seconds"],
        "red_seconds": signal["red_seconds"],
        "status": signal["status"],
        "image_last_updated": timestamp,
        "annotated_image_url": "/static/live_camera_latest.jpg",
        "fetch_error": None,
        "error": None,
        "night_mode": result.get("night_mode", False),
        "frame_brightness": result.get("frame_brightness"),
    }
    set_cached("live_camera_state", state, ttl_seconds=15)
    return state


def get_live_camera_state() -> dict[str, Any]:
    cached = get_cached("live_camera_state")
    if cached:
        return {**_live_state, **cached}
    return dict(_live_state)


def _merge_live_state(state: dict[str, Any], explanation: str | None = None) -> None:
    global _live_state
    _live_state = {**_live_state, **state}
    if explanation is not None:
        _live_state["explanation"] = explanation


async def run_live_camera_cycle(
    explain_fn: Callable[[int, int, int, int], Awaitable[str]],
) -> None:
    try:
        state = await asyncio.to_thread(fetch_and_analyze_live_camera)
        explanation = await explain_fn(
            state["vehicle_count"],
            state["person_count"],
            state["green_seconds"],
            state["red_seconds"],
        )
        _merge_live_state(state, explanation)
    except Exception as exc:
        logger.exception(
            "Live camera fetch/analyze cycle failed type=%s message=%s",
            type(exc).__name__,
            str(exc),
        )
        _live_state["fetch_error"] = str(exc)
        try:
            _live_state["error"] = json.loads(str(exc))
        except Exception:
            _live_state["error"] = _structured_error(str(exc), "unknown", "unknown")


async def live_camera_background_loop(
    explain_fn: Callable[[int, int, int, int], Awaitable[str]],
) -> None:
    while True:
        await run_live_camera_cycle(explain_fn)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
