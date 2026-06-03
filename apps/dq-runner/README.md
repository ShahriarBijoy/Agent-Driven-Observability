# dq-runner

`dq-runner` runs scheduled **data-quality checks** over the RAG pipeline (Phase 3). Every `DQ_CHECK_INTERVAL_SECONDS` (default 30s) it reads the `inferences` table that the gateway populates and evaluates five check families:

| Check | What it measures | Metric(s) |
| --- | --- | --- |
| **Freshness** | Seconds since the last inference per tenant, and since the last `chunks` update | `dq_freshness_seconds{dataset,tenant}` |
| **Volume** | Rolling 1-minute inference rate vs a 1-hour baseline | `dq_volume_count`, `dq_volume_ratio{tenant}` |
| **Distribution / drift** | KS distance of prompt length, retrieval score and completion tokens (current 5m vs 1h baseline) | `dq_distribution_drift{signal}` |
| **Schema** | Validates the latest 100 stored responses against the `ChatResponse` contract | `dq_schema_failures`, `dq_schema_sampled` |
| **Cache health** | Per-tenant embedding cache hit ratio | `dq_cache_hit_ratio{tenant}` |

Metrics are pushed via OTLP to Grafana Alloy → Mimir, so data quality shows up as first-class SLIs alongside the app SLIs (the "Data Quality" Grafana dashboard). Violations are written to the `dq_violations` Postgres table and counted as `dq_violations_total{check,severity}`; two Grafana alerts watch high-severity violations and sustained prompt drift.

HTTP surface: `GET /health`, `POST /run` (trigger a pass now), `GET /violations?limit=N`.

This app is managed with [uv](https://docs.astral.sh/uv/). Run `uv sync` to create the virtual environment, `uv run pytest` for the check unit tests, and `uv run python -m dq_runner` to launch the service. Python 3.11+ is required. See `docs/adr/004-data-observability.md` for the design and threshold rationale.
