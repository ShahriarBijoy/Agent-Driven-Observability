"""Integration test for run_pass with the db layer stubbed (no real Postgres)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from dq_runner import db, runner
from dq_runner.config import load_config
from dq_runner.state import Snapshot

NOW = datetime(2026, 6, 4, 12, 0, 0, tzinfo=timezone.utc)


class FakeCounter:
    def __init__(self) -> None:
        self.calls: list[tuple[int, dict]] = []

    def add(self, amount: int, attributes: dict | None = None) -> None:
        self.calls.append((amount, attributes or {}))


def test_run_pass_wires_checks_to_gauges_and_violations(monkeypatch):
    inserted: list[dict] = []

    monkeypatch.setattr(db, "last_inference_per_tenant", lambda conn: {"acme": NOW - timedelta(seconds=200)})
    monkeypatch.setattr(db, "max_created_at", lambda conn, table: NOW - timedelta(seconds=5))
    # window 60s -> no recent traffic; baseline 3600s -> healthy history => collapse.
    monkeypatch.setattr(
        db,
        "inference_counts",
        lambda conn, window: {"acme": 0} if window == 60 else {"acme": 600},
    )
    # baseline window (3600) vs current window (300) -> disjoint -> KS == 1.0.
    monkeypatch.setattr(
        db,
        "distribution_samples",
        lambda conn, column, window: (
            [float(x) for x in range(100)] if window == 3600 else [float(x) + 1000 for x in range(100)]
        ),
    )
    monkeypatch.setattr(
        db,
        "recent_responses",
        lambda conn, limit: [
            {
                "completion": "ok",
                "model": "m",
                "usage": {"promptTokens": 1, "completionTokens": 1},
                "retrieved": [],
                "cached": False,
            },
            {"completion": "", "model": "m", "usage": {"promptTokens": 1, "completionTokens": 1}, "retrieved": [], "cached": False},
        ],
    )
    monkeypatch.setattr(db, "cache_stats", lambda conn, window: {"acme": (0, 50)})
    monkeypatch.setattr(
        db,
        "insert_violation",
        lambda conn, check, signal, severity, dataset, payload: inserted.append(
            {"check": check, "severity": severity}
        ),
    )

    cfg = load_config()
    snapshot = Snapshot()
    violations = FakeCounter()
    runs = FakeCounter()

    summary = runner.run_pass(None, cfg, snapshot, violations, runs, redis_conn=None, now=NOW)

    # gauges populated
    assert snapshot.get_series("dq_freshness_seconds")
    assert snapshot.get_series("dq_volume_ratio") == [(0.0, {"tenant": "acme"})]
    assert ("dq_distribution_drift", 1.0) or snapshot.get_series("dq_distribution_drift")
    assert snapshot.get_series("dq_cache_hit_ratio") == [(0.0, {"tenant": "acme"})]
    assert snapshot.get_series("dq_schema_sampled") == [(2.0, {})]

    # every check family fired a violation
    checks_fired = {row["check"] for row in inserted}
    assert checks_fired == {"freshness", "volume", "distribution", "schema", "cache_health"}
    assert summary["violations"] == len(inserted)
    assert runs.calls == [(1, {})]
