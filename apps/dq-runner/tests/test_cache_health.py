from dq_runner.checks.cache_health import cache_hit_ratio, classify_cache


def test_cache_hit_ratio():
    assert cache_hit_ratio(7, 10) == 0.7


def test_cache_hit_ratio_is_none_without_samples():
    assert cache_hit_ratio(0, 0) is None


def test_classify_cache_flags_low_ratio_with_enough_samples():
    assert classify_cache(0.02, total=50, min_samples=20, min_ratio=0.05) == "low"


def test_classify_cache_abstains_on_small_samples():
    assert classify_cache(0.0, total=5, min_samples=20, min_ratio=0.05) is None


def test_classify_cache_passes_a_healthy_ratio():
    assert classify_cache(0.5, total=50, min_samples=20, min_ratio=0.05) is None
    assert classify_cache(None, total=0, min_samples=20, min_ratio=0.05) is None
