# infra/tempo

Tempo (traces) config — `tempo.yaml`.

Single-binary, local block storage. Accepts OTLP (gRPC `:4317` / HTTP `:4318`) from Alloy.
The **metrics-generator** is enabled with the `span-metrics` and `service-graphs` processors
(set per-tenant in `overrides.defaults.metrics_generator.processors`) and remote-writes the
derived metrics to Mimir (`mimir:9009/api/v1/push`, `send_exemplars: true`).

That generator is what powers Grafana's **Service Map** (`traces_service_graph_*`) and the RED
**exemplars** (`traces_spanmetrics_latency_bucket` carries a `traceID` exemplar) — OTel-JS does
not emit metric exemplars itself, so they come from here. See
`docs/adr/003-application-observability.md`.
