# infra/mimir

Mimir (metrics) config — `mimir.yaml` (+ `rules/`).

Monolithic mode (`-target=all`), local-filesystem block storage, `multitenancy_enabled: false`
(no `X-Scope-OrgID` needed). Ingests both **OTLP** (`/otlp/v1/metrics`, from Alloy) and
**Prometheus remote-write** (`/api/v1/push`, from Tempo's metrics-generator). Exemplars are
enabled (`max_global_exemplars_per_user`, default is 0 = off) along with native-histogram
ingestion and a generous out-of-order window for bursty dev traffic.

`rules/` is the ruler's local rule directory (bind-mounted so it exists at startup); recording
and SLO/alert rules land here in Phase 6. Dev-only — filesystem storage is not for production.
