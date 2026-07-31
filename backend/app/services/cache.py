"""Simple in-memory TTL cache for live camera and similar runtime state."""

from datetime import datetime, timedelta
from typing import Any, Optional

_cache: dict[str, tuple[datetime, Any]] = {}


def set_cached(key: str, value: Any, ttl_seconds: int = 60) -> None:
    _cache[key] = (datetime.utcnow() + timedelta(seconds=ttl_seconds), value)


def get_cached(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if datetime.utcnow() > expires_at:
        _cache.pop(key, None)
        return None
    return value
