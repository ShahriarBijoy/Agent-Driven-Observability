from dq_runner.state import Snapshot


def test_snapshot_round_trips_a_series():
    snap = Snapshot()
    snap.set_series("dq_freshness_seconds", [(45.0, {"dataset": "inferences", "tenant": "acme"})])
    assert snap.get_series("dq_freshness_seconds") == [
        (45.0, {"dataset": "inferences", "tenant": "acme"})
    ]


def test_snapshot_returns_empty_for_unknown_metric():
    assert Snapshot().get_series("nope") == []


def test_snapshot_overwrites_a_series_on_each_set():
    snap = Snapshot()
    snap.set_series("dq_volume_ratio", [(1.0, {"tenant": "a"})])
    snap.set_series("dq_volume_ratio", [(0.2, {"tenant": "a"})])
    assert snap.get_series("dq_volume_ratio") == [(0.2, {"tenant": "a"})]
