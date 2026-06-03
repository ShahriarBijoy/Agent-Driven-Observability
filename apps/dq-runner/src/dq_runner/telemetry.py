"""OpenTelemetry metrics for the dq-runner.

Each check writes its latest results into the shared Snapshot; observable gauges
read them when the OTLP exporter flushes, so dq_* metrics land in Mimir alongside
the app SLIs (the whole point: data quality as first-class SLIs). Violations and
pass counts are plain counters.
"""

from __future__ import annotations

from collections.abc import Iterable

from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.metrics import CallbackOptions, Counter, Observation
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource

from dq_runner.state import Snapshot

GAUGES: list[tuple[str, str]] = [
    ("dq_freshness_seconds", "Seconds since a dataset/tenant last produced data"),
    ("dq_volume_count", "Inferences observed in the current volume window"),
    ("dq_volume_ratio", "Current inference rate vs the 1-hour baseline"),
    ("dq_distribution_drift", "KS drift distance (current 5m vs 1h baseline)"),
    ("dq_cache_hit_ratio", "Embedding cache hit ratio per tenant"),
    ("dq_schema_failures", "Schema validation failures in the latest sample"),
    ("dq_schema_sampled", "Responses validated in the latest schema sample"),
    ("dq_cache_keys", "Keys in the embedding cache (Redis DBSIZE)"),
]


class Metrics:
    def __init__(self, provider: MeterProvider, violations: Counter, runs: Counter) -> None:
        self.provider = provider
        self.violations = violations
        self.runs = runs

    def shutdown(self) -> None:
        self.provider.shutdown()


def setup_metrics(endpoint: str, snapshot: Snapshot, export_interval_ms: int) -> Metrics:
    exporter = OTLPMetricExporter(endpoint=f"{endpoint.rstrip('/')}/v1/metrics")
    reader = PeriodicExportingMetricReader(exporter, export_interval_millis=export_interval_ms)
    provider = MeterProvider(
        resource=Resource.create({"service.name": "dq-runner"}),
        metric_readers=[reader],
    )
    meter = provider.get_meter("dq-runner")

    def make_callback(metric_name: str):
        def callback(_options: CallbackOptions) -> Iterable[Observation]:
            return [Observation(value, attrs) for value, attrs in snapshot.get_series(metric_name)]

        return callback

    for name, description in GAUGES:
        meter.create_observable_gauge(name, callbacks=[make_callback(name)], description=description)

    violations = meter.create_counter("dq_violations_total", description="DQ violations recorded")
    runs = meter.create_counter("dq_check_runs_total", description="DQ check passes executed")
    return Metrics(provider, violations, runs)
