"""
Regression tests for GemmaService fallback routing and response parsing.
Run: cd backend && .venv\Scripts\python -m pytest tests/test_gemma.py -v
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.gemma import GemmaService


def test_extract_response_text_skips_thought_parts():
    data = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "Let me think step by step...", "thought": True},
                        {"text": "The ward shows elevated risk."},
                    ]
                }
            }
        ]
    }
    assert GemmaService._extract_response_text(data) == (
        "The ward shows elevated risk.",
        "ok",
        "unknown",
    )


def test_extract_response_text_returns_none_when_only_thoughts():
    data = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "internal reasoning", "thought": True}]
                }
            }
        ]
    }
    assert GemmaService._extract_response_text(data) == (
        None,
        "only_thought_parts count=1 finishReason=unknown",
        "unknown",
    )


def test_water_planning_fallback_routes_explicitly_not_by_ward_data_keyword():
    """Health Watch prompts contain 'ward data' — must not trigger water fallback."""
    service = GemmaService()
    health_watch_prompt = (
        "Given the following ward data:\n"
        "- Ward: Koramangala\n"
        "- Stagnant water reports (7 days): 6\n"
    )
    generic = service._fallback(health_watch_prompt, json_mode=False, fallback_type=None)
    assert "allocation_litres" not in generic
    assert "offline mode" in generic.lower()

    water_prompt = 'Ward data: {"days_since_supply": 6, "complaints": 9, "available_water_litres": 50000}'
    water_json = service._fallback(water_prompt, json_mode=True, fallback_type="water_planning")
    water = json.loads(water_json)
    assert water["priority"] == "High"
    assert water["supply_today"] is True
    assert "allocation_litres" in water
