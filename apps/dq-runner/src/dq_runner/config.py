"""Environment configuration and DQ thresholds for the dq-runner."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw else default


@dataclass(frozen=True)
class Config:
    database_url: str
    redis_url: str | None
    otel_endpoint: str
    port: int
    check_interval_seconds: int
    metric_export_interval_ms: int

    # Windows (seconds).
    volume_window_seconds: int
    volume_baseline_seconds: int
    drift_current_seconds: int
    drift_baseline_seconds: int
    cache_window_seconds: int

    # Thresholds.
    volume_low: float
    volume_high: float
    drift_warn: float
    drift_high: float
    distribution_min_samples: int
    freshness_max_seconds: float
    cache_min_samples: int
    cache_min_ratio: float
    schema_sample_size: int


def load_config(env: dict[str, str] | None = None) -> Config:
    if env is not None:
        os.environ.update(env)
    return Config(
        database_url=os.environ.get(
            "DATABASE_URL", "postgres://lab:lab@localhost:5432/observability_lab"
        ),
        redis_url=os.environ.get("REDIS_URL") or None,
        otel_endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"),
        port=_int("DQ_RUNNER_PORT", 8091),
        check_interval_seconds=_int("DQ_CHECK_INTERVAL_SECONDS", 30),
        metric_export_interval_ms=_int("OTEL_METRIC_EXPORT_INTERVAL_MS", 10000),
        volume_window_seconds=_int("DQ_VOLUME_WINDOW_SECONDS", 60),
        volume_baseline_seconds=_int("DQ_VOLUME_BASELINE_SECONDS", 3600),
        drift_current_seconds=_int("DQ_DRIFT_CURRENT_SECONDS", 300),
        drift_baseline_seconds=_int("DQ_DRIFT_BASELINE_SECONDS", 3600),
        cache_window_seconds=_int("DQ_CACHE_WINDOW_SECONDS", 300),
        volume_low=_float("DQ_VOLUME_LOW", 0.3),
        volume_high=_float("DQ_VOLUME_HIGH", 3.0),
        drift_warn=_float("DQ_DRIFT_WARN", 0.25),
        drift_high=_float("DQ_DRIFT_HIGH", 0.4),
        distribution_min_samples=_int("DQ_DISTRIBUTION_MIN_SAMPLES", 20),
        freshness_max_seconds=_float("DQ_FRESHNESS_MAX_SECONDS", 120),
        cache_min_samples=_int("DQ_CACHE_MIN_SAMPLES", 20),
        cache_min_ratio=_float("DQ_CACHE_MIN_RATIO", 0.05),
        schema_sample_size=_int("DQ_SCHEMA_SAMPLE_SIZE", 100),
    )
