"""
Regression tests for health_watch service.
Run: cd backend && .venv\Scripts\python -m pytest tests/test_health_watch.py -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.health_watch import (
    compute_risk_score,
    _gemma_cache_key,
    _compute_heat_index_norm,
    WEIGHTS,
    NORM_CEILINGS,
    BENGALURU_SEASONAL_NORM_C,
)


def test_risk_score_all_zero():
    """All-zero inputs must produce score=0."""
    r = compute_risk_score(0, 28.0, None, 0, 0.0)
    assert r["score"] == 0.0
    assert r["score_raw"] == 0.0


def test_risk_score_max_inputs():
    """Inputs at ceiling must produce score=100."""
    r = compute_risk_score(15, 34.0, None, 20, -30.0)
    assert r["score"] == 100.0


def test_risk_score_stagnant_only():
    """Only stagnant water at ceiling — score should equal that weight × 100."""
    r = compute_risk_score(15, 28.0, None, 0, 0.0)
    expected = round(WEIGHTS["stagnant_reports"] * 100, 1)
    assert r["score"] == expected, f"Expected {expected}, got {r['score']}"


def test_heat_index_zero_anomaly_basavanagudi():
    """Regression: 22.6°C with 75% humidity — anomaly is 0 so score must be 0.
    This was the Basavanagudi bug: humidity phantom inflating score when temp < norm."""
    norm = _compute_heat_index_norm(22.6, 75.0)
    assert norm == 0.0, f"Humidity phantom bug regression: expected 0.0, got {norm}"


def test_heat_index_zero_anomaly_at_norm():
    """Exactly at seasonal norm → 0 anomaly → 0 score, even with high humidity."""
    norm = _compute_heat_index_norm(BENGALURU_SEASONAL_NORM_C, 90.0)
    assert norm == 0.0


def test_heat_index_above_norm():
    """31°C = 3°C above 28°C norm, no humidity → norm = 3/6 = 0.5."""
    norm = _compute_heat_index_norm(31.0, None)
    assert abs(norm - 0.5) < 0.001, f"Expected 0.5, got {norm}"


def test_heat_index_humidity_only_applies_above_baseline():
    """Humidity bonus only kicks in when temp > seasonal norm."""
    # Below norm: humidity irrelevant
    norm_below = _compute_heat_index_norm(25.0, 95.0)
    assert norm_below == 0.0
    # Above norm: humidity adds a small bonus on top of anomaly
    norm_above_no_humidity   = _compute_heat_index_norm(30.0, None)
    norm_above_with_humidity = _compute_heat_index_norm(30.0, 80.0)
    assert norm_above_with_humidity >= norm_above_no_humidity


def test_gemma_cache_key_per_ward():
    """Regression: cache key must differ between wards (was the stale-state root cause)."""
    from datetime import date
    today = date.today().isoformat()
    k1 = _gemma_cache_key(1)
    k2 = _gemma_cache_key(2)
    assert k1 == f"1:{today}"
    assert k2 == f"2:{today}"
    assert k1 != k2, "Cache keys must differ between wards"


def test_gemma_cache_key_includes_today():
    """Cache key must include today's date so it expires daily."""
    from datetime import date
    key = _gemma_cache_key(5)
    assert date.today().isoformat() in key


def test_metabolism_positive_delta_no_risk():
    """Positive water_supply_delta (supply improving) must contribute 0 to score."""
    r = compute_risk_score(0, 28.0, None, 0, +15.0)
    assert r["components"]["metabolism_stress"]["weighted"] == 0.0
    assert r["score"] == 0.0


def test_score_formula_string_present():
    """API response must include the formula string for UI transparency."""
    r = compute_risk_score(5, 30.0, None, 3, 0.0)
    assert "formula" in r
    assert "stagnant_reports_norm" in r["formula"]

# ---------------------------------------------------------------------------
# Prompt-echo detection regression tests (bug fixed 2026-07-29)
# ---------------------------------------------------------------------------

from app.services.health_watch import _is_prompt_echo, _clean_prose_response


def test_prompt_echo_detects_role_prefix():
    """Regression: response starting with 'Role:' must be detected as prompt echo."""
    bad = "Role: Explaining ward-level environmental public health...\nConstraint 1: Never diagnose..."
    assert _is_prompt_echo(bad) is True


def test_prompt_echo_detects_constraint_prefix():
    """Regression: 'Constraint 1' in the first 300 chars must flag as prompt echo."""
    bad = "Constraint 1: You never diagnose individuals.\nConstraint 4 (Input Data): Ward: Marathahalli"
    assert _is_prompt_echo(bad) is True


def test_prompt_echo_detects_ward_data_block():
    """Response beginning with '- Ward:' (the data block echo) must be flagged."""
    bad = "- Ward: Koramangala\n- Stagnant water reports (7 days): 9\n- Temperature anomaly: +0.0°C"
    assert _is_prompt_echo(bad) is True


def test_prompt_echo_detects_given_the_following():
    """'Given the following ward data' echoed back must be flagged."""
    bad = "Given the following ward data:\n- Ward: HSR Layout\n..."
    assert _is_prompt_echo(bad) is True


def test_prompt_echo_clean_prose_passes():
    """A real 2-sentence Gemma explanation must NOT be flagged."""
    good = (
        "HSR Layout faces elevated environmental risk due to six stagnant-water reports "
        "and seven health-tagged complaints over the past week. "
        "These conditions create favourable breeding grounds for vector-borne risk."
    )
    assert _is_prompt_echo(good) is False


def test_prompt_echo_clean_prose_intervention_passes():
    """A real intervention suggestion must NOT be flagged."""
    good = "Deploy fogging teams to the three largest reported stagnant-water sites in HSR Layout within 48 hours."
    assert _is_prompt_echo(good) is False


def test_clean_prose_response_returns_fallback_on_echo():
    """_clean_prose_response must return the fallback string when given a prompt echo."""
    bad      = "Role: Explaining ward-level environmental risk factors..."
    fallback = "Fallback explanation text."
    result   = _clean_prose_response(bad, fallback)
    assert result == fallback


def test_clean_prose_response_returns_text_on_good_response():
    """_clean_prose_response must return the original text when it is clean prose."""
    good     = "BTM Layout shows elevated risk due to high stagnant water and complaint density."
    fallback = "Fallback explanation text."
    result   = _clean_prose_response(good, fallback)
    assert result == good


def test_clean_prose_response_handles_empty_string():
    """Empty response must return fallback."""
    result = _clean_prose_response("", "fallback")
    assert result == "fallback"


def test_prompt_echo_case_insensitive():
    """Detection must be case-insensitive — mixed case should still be caught."""
    bad = "YOU ARE EXPLAINING ward-level environmental public health risk..."
    assert _is_prompt_echo(bad) is True
