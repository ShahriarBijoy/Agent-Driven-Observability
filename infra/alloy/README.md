# infra/alloy

Grafana Alloy — the single OTLP ingress for the lab (`config.alloy`, River syntax).

`config.alloy` receives OTLP over gRPC (`:4317`) and HTTP (`:4318`), batches, and fans out:

- **traces** → Tempo (`otelcol.exporter.otlp` → `tempo:4317`)
- **metrics** → Mimir via the **OTLP-direct** path (`otelcol.exporter.otlphttp` → `mimir:9009/otlp`)
- **logs** → Loki's native OTLP endpoint (`otelcol.exporter.otlphttp` → `loki:3100/otlp`)

Metrics go OTLP-direct rather than through `otelcol.exporter.prometheus` →
`prometheus.remote_write`, because that conversion drops OTLP exemplars. Kept intentionally
small; extended in Phase 6. See `docs/adr/003-application-observability.md`.
