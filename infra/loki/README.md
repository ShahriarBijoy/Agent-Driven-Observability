# infra/loki

Loki (logs) config — `loki.yaml`.

Single-binary mode, local-filesystem storage (TSDB schema v13), `auth_enabled: false`
(single tenant). `allow_structured_metadata` is on so OTLP logs carry `trace_id`/`span_id` as
structured metadata (this is what links a log line back to its trace in Tempo). Dev-generous
ingestion limits so sustained load-generator traffic is never rate-limited. Receives logs from
Alloy on its native OTLP endpoint (`/otlp/v1/logs`). Dev-only — not for production.
