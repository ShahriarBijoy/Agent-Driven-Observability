# slo/

SLO definitions for the AI Observability Lab (Phase 6).

Each YAML file is the **source-of-truth spec** for one SLO: its objective, the
rolling error-budget window, the SLI (a `good`/`total` PromQL event ratio), and
the multi-window multi-burn-rate alerting parameters. The specs are compiled by
hand — the maths is written out in comments — into:

- **Mimir recording rules** → `infra/mimir/rules/` (instantaneous SLI, the
  short/long burn-rate ratios, and the rolling 28-day compliance number)
- **Grafana burn-rate alerts** → `infra/grafana/provisioning/alerting/rules.yaml`
  (group `slo-burn`), which route to the agent-service incident reporter

| File                        | Objective | SLI                                 |
| --------------------------- | --------- | ----------------------------------- |
| `gateway-availability.yaml` | 99.5%     | non-5xx `/v1/chat` responses        |
| `gateway-latency.yaml`      | 95%       | `/v1/chat` requests under 1.5s      |
| `rag-quality.yaml`          | 90%       | retrievals with a top-1 score ≥ 0.6 |

## Burn-rate maths

```
burn_rate_threshold   = budget_fraction * (window / long_window)
error_ratio_threshold = burn_rate_threshold * (1 - objective)
```

A **fast-burn** (page) alert fires when both the 5m and 1h burn-rate windows
exceed the threshold for spending 2% of the 28-day budget in 1h. A **slow-burn**
(ticket) alert uses the 30m and 6h windows for spending 10% of the budget in 6h.

Note that a loose objective has a large budget, which pushes its error-ratio
threshold up — the RAG-quality SLO (90%, so a 10% budget) would need a bad-ratio
above 1.0 to fast-burn, which is impossible, so it alerts directly on the SLI
dropping below the objective instead. Multi-window burn-rate alerting is built
for tight SLOs.
