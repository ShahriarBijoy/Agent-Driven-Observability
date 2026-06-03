from dq_runner.checks.volume import classify_volume, volume_ratio


def test_volume_ratio_normalises_against_baseline_per_minute():
    # 30 inferences in the last minute vs a baseline of 30/min → ratio 1.0
    assert volume_ratio(30, 30.0) == 1.0
    assert volume_ratio(9, 30.0) == 0.3


def test_volume_ratio_is_none_without_a_baseline():
    # No baseline traffic → ratio is undefined (skip, don't false-alarm).
    assert volume_ratio(5, 0.0) is None


def test_classify_volume_flags_a_collapse_as_high_severity():
    # Traffic dried up (ratio below the low threshold) — the serious case.
    assert classify_volume(0.0, low=0.3, high=3.0) == ("low_volume", "high")
    assert classify_volume(0.2, low=0.3, high=3.0) == ("low_volume", "high")


def test_classify_volume_flags_a_spike_as_medium_severity():
    assert classify_volume(3.5, low=0.3, high=3.0) == ("high_volume", "medium")


def test_classify_volume_passes_a_normal_ratio():
    assert classify_volume(1.0, low=0.3, high=3.0) is None
    assert classify_volume(2.9, low=0.3, high=3.0) is None
