# infra/grafana

Grafana provisioning (mounted read-only at `/etc/grafana/provisioning`). Grafana runs with
anonymous admin access at http://localhost:3001.

```
provisioning/
  datasources/datasources.yaml   # Mimir (default), Loki, Tempo — cross-linked
  dashboards/dashboards.yaml      # file provider
  dashboards/gateway-red.json     # rate / errors / duration (exemplars on latency)
  dashboards/rag-pipeline.json    # tokens, cache-hit, retrieval relevance, rejections, top tenants
  alerting/contact-points.yaml    # agent-webhook (placeholder, wired in Phase 5)
  alerting/policies.yaml          # notification routing
  alerting/rules.yaml             # gateway 5xx > 2% (2m); p95 > 2s (5m)
```

The datasources are cross-linked so the three-pillar drill-down works: Mimir exemplars →
Tempo, Tempo `tracesToLogsV2`/`serviceMap` → Loki/Mimir, Loki derived `trace_id` → Tempo.
More datasources (Pyroscope) and dashboards arrive in later phases. See
`docs/adr/003-application-observability.md`.
