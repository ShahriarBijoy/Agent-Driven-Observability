---
alert_types: [dq-high-violation, DQ high-severity violation, dq-prompt-drift, DQ prompt drift sustained]
tools: [marquez_lineage, mimir_query, pg_select]
hypotheses:
  - The producing job for this dataset stopped emitting new runs
  - The dq-runner itself crashed and stopped re-checking on schedule
  - The source is intentionally idle (load generator/seed off), which is stale-by-design, not an incident
---

# Data-quality freshness stall

**Trigger:** the `data-quality` dashboard shows `dq_freshness_minutes` climbing, or the freshness alert fires for the documents pipeline.

## Diagnose

1. Open the **Data Quality** dashboard — identify which dataset stalled and since when.
2. Check Marquez lineage (:3002) for the dataset's most recent run — did the producing job stop, or start failing?
3. Inspect the dq-runner logs: `docker compose -f infra/compose.yml -f infra/compose.lineage.yml logs dq-runner --tail 100`.
4. Confirm Postgres is reachable and the source table is receiving writes.

## Mitigate

1. If the producing job is down: restart it and watch a new OpenLineage run appear in Marquez.
2. If dq-runner itself crashed: restart it; checks are idempotent and will re-baseline on the next cycle.
3. If the source genuinely stopped (seed/load-generator off): start the load generator — stale-by-design data is not an incident.

## Verify

- `dq_freshness_minutes` back under the SLO threshold.
- A fresh OpenLineage run for the dataset visible in Marquez.
