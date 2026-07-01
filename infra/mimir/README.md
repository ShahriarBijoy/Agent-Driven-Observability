# infra/mimir

Mimir (metrics) config — `mimir.yaml` (+ `rules/`).

Monolithic mode (`-target=all`), local-filesystem block storage, `multitenancy_enabled: false`
(no `X-Scope-OrgID` needed). Ingests both **OTLP** (`/otlp/v1/metrics`, from Alloy) and
**Prometheus remote-write** (`/api/v1/push`, from Tempo's metrics-generator). Exemplars are
enabled (`max_global_exemplars_per_user`, default is 0 = off) along with native-histogram
ingestion and a generous out-of-order window for bursty dev traffic.

`rules/` is the ruler's local rule directory (bind-mounted so it exists at startup). Because the
ruler's `local` store is tenant-scoped and `multitenancy_enabled: false` makes every request use
the tenant **`anonymous`**, the rule files live under `rules/anonymous/`:

- `slo-gateway.yaml` — availability + latency SLO recording rules (burn-rate error ratios over
  5m/1h/30m/6h, an instantaneous SLI, and rolling 28-day compliance)
- `slo-rag.yaml` — RAG-quality SLI + 28-day compliance

These are Prometheus-format recording rules compiled by hand from `slo/*.yaml`. The **burn-rate
alerts** that consume them live in Grafana (`infra/grafana/provisioning/alerting/`), not here — the
Mimir ruler only records, so no Alertmanager is wired. Validate with
`promtool check rules rules/anonymous/*.yaml`. Dev-only — filesystem storage is not for production.
