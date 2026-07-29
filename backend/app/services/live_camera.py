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

# Four fixed Caltrans D8 I-10 cameras — verified 2026-07-29 via cctvStatusD08.txt + curl.
LIVE_CAMERAS: dict[str, dict[str, str]] = {
    "north": {
        "road": "North",
        "label": "Camera A · North",
        "slug": "i1011woarchibaldave",
        "source": "Caltrans D8 - I-10 w/o Archibald Ave, Ontario, California",
        "image_file": "live_camera_north.jpg",
    },
    "east": {
        "road": "East",
        "label": "Camera B · East",
        "slug": "i1012westofhaven",
        "source": "Caltrans D8 - I-10 west of Haven Ave, Ontario, California",
        "image_file": "live_camera_east.jpg",
    },
    "south": {
        "road": "South",
        "label": "Camera C · South",
        "slug": "i1004bensonavenue",
        "source": "Caltrans D8 - I-10 Benson Ave, Montclair, California",
        "image_file": "live_camera_south.jpg",
    },
    "west": {
        "road": "West",
        "label": "Camera D · West",
        "slug": "i1010eastofvineyard",
        "source": "Caltrans D8 - I-10 east of Vineyard, Ontario, California",
        "image_file": "live_camera_west.jpg",
    },
}

# Primary camera for legacy /live-camera endpoint (North / Archibald — unchanged slug).
PRIMARY_CAMERA_ID = "north"

_request_headers = {"User-Agent": "DystopiaCITY-CommandSignal/1.0 (+local demo)"}

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

POLL_INTERVAL_SECONDS = 12
FETCH_TIMEOUT_SECONDS = 15


def _default_camera_state(camera_id: str) -> dict[str, Any]:
    cam = LIVE_CAMERAS[camera_id]
    return {
        "camera_id": camera_id,
        "road": cam["road"],
        "label": cam["label"],
        "camera_source": cam["source"],
        "vehicle_count": 0,
        "person_count": 0,
        "detections": [],
        "green_seconds": 30,
        "red_seconds": 30,
        "status": "Light",
        "image_last_updated": None,
        "annotated_image_url": f"/static/{cam['image_file']}",
        "fetch_error": None,
        "error": None,
        "night_mode": False,
        "frame_brightness": None,
    }


_live_states: dict[str, dict[str, Any]] = {
    cid: _default_camera_state(cid) for cid in LIVE_CAMERAS
}
# Legacy merged state for GET /live-camera (North + Gemma explanation).
_live_state: dict[str, Any] = {
    **_default_camera_state(PRIMARY_CAMERA_ID),
    "explanation": "Waiting for first live camera fetch…",
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


def _download_slug(slug: str) -> bytes:
    url = _camera_url(slug)
    try:
        try:
            return _attempt_download(url, verify_ssl=settings.http_ssl_verify)
        except Exception as ssl_exc:
            if settings.http_ssl_verify:
                _log_fetch_failure(slug, url, ssl_exc, "ssl_verify_true")
                logger.warning(
                    "Retrying Caltrans fetch with verify=False after %s: %s",
                    type(ssl_exc).__name__,
                    ssl_exc,
                )
                return _attempt_download(url, verify_ssl=False)
            raise
    except Exception as exc:
        _log_fetch_failure(slug, url, exc, "slug_failed")
        raise


def fetch_and_analyze_camera(camera_id: str) -> dict[str, Any]:
    """Fetch one fixed camera slug, run detection, return state dict."""
    if camera_id not in LIVE_CAMERAS:
        raise ValueError(f"unknown camera_id={camera_id}")

    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    cam = LIVE_CAMERAS[camera_id]
    slug = cam["slug"]
    image_path = STATIC_DIR / cam["image_file"]

    image_bytes = _download_slug(slug)
    image_path.write_bytes(image_bytes)

    result = analyze_frame(str(image_path), low_light_assist=True)
    signal = compute_live_signal(result["vehicle_count"])
    timestamp = datetime.utcnow().isoformat()

    state = {
        "camera_id": camera_id,
        "road": cam["road"],
        "label": cam["label"],
        "camera_source": cam["source"],
        "vehicle_count": result["vehicle_count"],
        "person_count": result["person_count"],
        "detections": result["detections"],
        "green_seconds": signal["green_seconds"],
        "red_seconds": signal["red_seconds"],
        "status": signal["status"],
        "image_last_updated": timestamp,
        "annotated_image_url": f"/static/{cam['image_file']}",
        "fetch_error": None,
        "error": None,
        "night_mode": result.get("night_mode", False),
        "frame_brightness": result.get("frame_brightness"),
        "light_blob_added": result.get("light_blob_added"),
    }
    set_cached(f"live_camera_state_{camera_id}", state, ttl_seconds=15)
    logger.info("Live camera OK id=%s slug=%s vehicles=%s", camera_id, slug, state["vehicle_count"])
    return state


def fetch_and_analyze_live_camera() -> dict[str, Any]:
    """Legacy helper — primary (North) camera only."""
    return fetch_and_analyze_camera(PRIMARY_CAMERA_ID)


def get_live_camera_state(camera_id: str = PRIMARY_CAMERA_ID) -> dict[str, Any]:
    cached = get_cached(f"live_camera_state_{camera_id}")
    base = _live_states.get(camera_id, _default_camera_state(camera_id))
    if cached:
        return {**base, **cached}
    return dict(base)


def get_all_live_cameras_state() -> dict[str, Any]:
    cameras = {cid: get_live_camera_state(cid) for cid in LIVE_CAMERAS}
    if _live_state.get("explanation"):
        cameras[PRIMARY_CAMERA_ID] = {
            **cameras[PRIMARY_CAMERA_ID],
            "explanation": _live_state["explanation"],
        }
    return {
        "cameras": cameras,
        "last_updated": datetime.utcnow().isoformat(),
    }


def get_legacy_live_camera_state() -> dict[str, Any]:
    """North camera state + Gemma explanation for GET /live-camera."""
    cached = get_cached(f"live_camera_state_{PRIMARY_CAMERA_ID}")
    if cached:
        return {**_live_state, **cached}
    return dict(_live_state)


def _merge_camera_state(camera_id: str, state: dict[str, Any]) -> None:
    global _live_states
    _live_states[camera_id] = {**_live_states.get(camera_id, {}), **state}


def _merge_live_state(state: dict[str, Any], explanation: str | None = None) -> None:
    global _live_state
    _live_states[PRIMARY_CAMERA_ID] = {**_live_states[PRIMARY_CAMERA_ID], **state}
    _live_state = {**_live_state, **state}
    if explanation is not None:
        _live_state["explanation"] = explanation


async def run_live_camera_cycle(
    explain_fn: Callable[[int, int, int, int], Awaitable[str]],
) -> None:
    """Fetch + analyze all four cameras; Gemma explanation only for North (legacy)."""
    results: dict[str, dict[str, Any] | None] = {}
    errors: dict[str, str] = {}

    async def _one(cid: str) -> None:
        try:
            results[cid] = await asyncio.to_thread(fetch_and_analyze_camera, cid)
            _merge_camera_state(cid, results[cid])  # type: ignore[arg-type]
        except Exception as exc:
            logger.exception(
                "Camera cycle failed id=%s type=%s message=%s",
                cid,
                type(exc).__name__,
                str(exc),
            )
            err = str(exc)
            errors[cid] = err
            fail = {**get_live_camera_state(cid), "fetch_error": err}
            try:
                fail["error"] = json.loads(err)
            except Exception:
                slug = LIVE_CAMERAS[cid]["slug"]
                fail["error"] = _structured_error(err, slug, _camera_url(slug))
            _merge_camera_state(cid, fail)

    await asyncio.gather(*(_one(cid) for cid in LIVE_CAMERAS))

    north = results.get(PRIMARY_CAMERA_ID)
    if north:
        try:
            explanation = await explain_fn(
                north["vehicle_count"],
                north["person_count"],
                north["green_seconds"],
                north["red_seconds"],
            )
            _merge_live_state(north, explanation)
        except Exception as exc:
            logger.exception("Gemma explain failed: %s", exc)
            _merge_live_state(north)
    elif PRIMARY_CAMERA_ID in errors:
        _live_state["fetch_error"] = errors[PRIMARY_CAMERA_ID]


async def live_camera_background_loop(
    explain_fn: Callable[[int, int, int, int], Awaitable[str]],
) -> None:
    while True:
        await run_live_camera_cycle(explain_fn)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
