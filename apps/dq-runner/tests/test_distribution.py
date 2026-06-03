from dq_runner.checks.distribution import classify_drift, ks_drift


def test_ks_drift_is_zero_for_identical_samples():
    sample = [float(x) for x in range(100)]
    assert ks_drift(sample, sample) == 0.0


def test_ks_drift_detects_a_shifted_distribution():
    baseline = [float(x) for x in range(100)]
    shifted = [float(x) + 100 for x in range(100)]  # fully disjoint → D == 1.0
    assert ks_drift(baseline, shifted) == 1.0


def test_ks_drift_is_none_with_insufficient_samples():
    assert ks_drift([1.0, 2.0], [3.0, 4.0], min_samples=20) is None


def test_classify_drift_thresholds():
    assert classify_drift(0.1, warn=0.25, high=0.4) is None
    assert classify_drift(0.30, warn=0.25, high=0.4) == "medium"
    assert classify_drift(0.50, warn=0.25, high=0.4) == "high"
