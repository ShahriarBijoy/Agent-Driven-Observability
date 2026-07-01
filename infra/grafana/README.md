# infra/grafana

Grafana provisioning (mounted read-only at `/etc/grafana/provisioning`). Grafana runs with
anonymous admin access at http://localhost:3001.

```
provisioning/
  datasources/datasources.yaml   # Mimir (default), Loki, Tempo, Pyroscope — cross-linked
  dashboards/dashboards.yaml      # file provider
  dashboards/gateway-red.json     # rate / errors / duration (exemplars) + Frontend RUM row
  dashboards/rag-pipeline.json    # tokens, cache-hit, retrieval relevance, rejections, top tenants
  dashboards/data-quality.json    # DQ violations + distribution drift
  dashboards/profiles.json        # gateway CPU flame graph (Pyroscope)
  alerting/contact-points.yaml    # agent-webhook → agent-service incident reporter
  alerting/policies.yaml          # notification routing
  alerting/rules.yaml             # gateway 5xx/p95, data-quality, slo-burn, mimir-cardinality
```

## Signal correlation (the seams between pillars)

The datasources are cross-linked so one click flows across all four signals:

- **metric → trace**: Mimir exemplars carry a `trace_id` → Tempo.
- **trace → logs / metrics**: Tempo `tracesToLogsV2` → Loki, `tracesToMetrics`/`serviceMap` → Mimir.
- **log → trace**: Loki's derived `trace_id` field → Tempo.
- **trace → profile** (Phase 6): Tempo `tracesToProfiles` → Pyroscope (CPU flame graph).

The log ↔ trace seam depends on **every request log line carrying `trace_id`**. The shared
logger (`@obs/telemetry` `createLogger`) reads the active span context on every line and stamps
`trace_id`/`span_id` into both the stdout JSON and the exported OTel `LogRecord`; the Logs SDK
also injects the trace context automatically, which Loki ingests as structured metadata that the
derived field matches. Logs emitted outside any span (e.g. a service's startup banner) have no
trace — that is correct, they belong to no request. See
`docs/adr/003-application-observability.md`.
