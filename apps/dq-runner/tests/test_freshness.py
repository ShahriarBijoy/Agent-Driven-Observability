from datetime import datetime, timedelta, timezone

from dq_runner.checks.freshness import classify_freshness, freshness_seconds

NOW = datetime(2026, 6, 4, 12, 0, 0, tzinfo=timezone.utc)


def test_freshness_seconds_elapsed_since_last_event():
    assert freshness_seconds(NOW - timedelta(seconds=45), NOW) == 45.0


def test_freshness_seconds_is_none_without_data():
    assert freshness_seconds(None, NOW) is None


def test_classify_freshness_flags_stale_data():
    assert classify_freshness(200.0, max_seconds=120) == "medium"


def test_classify_freshness_passes_fresh_or_absent():
    assert classify_freshness(30.0, max_seconds=120) is None
    assert classify_freshness(None, max_seconds=120) is None
