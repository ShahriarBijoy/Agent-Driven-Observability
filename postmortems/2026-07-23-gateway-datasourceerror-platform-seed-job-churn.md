# Postmortem: gateway 5xx rate above 2%

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 20:27:01Z
- **Resolved:** 2026-07-23 20:32:01Z

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 20:11:13Z | deploy:ci | CI run #76 success on agent-service/orphan-cleanup-phase11-doc: obs: agent-service: fail orphaned runs at startup; docs: phase 11 explainer

A restart orphans in-flight runs and nothin |
| 20:12:19Z | deploy:ci | CI run #77 success on agent-service/orphan-cleanup-phase11-doc: obs: agent-service: fail orphaned runs at startup

A restart orphans in-flight runs and nothing resumed them, so their r |
| 20:25:50Z | alert | alert firing: DatasourceError |
| 20:26:10Z | alert | alert firing: DatasourceError |
| 20:26:10Z | alert | alert resolved: DatasourceError |
| 20:26:50Z | alert | alert firing: DatasourceError |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784838421764%22%2C+%22to%22%3A+%221784838721686%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784838421764%22%2C+%22to%22%3A+%221784838721686%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 `DatasourceError` paged on "gateway 5xx rate above 2%" for tenant acme. The alert fired briefly (2 evaluations) and cleared on its own before any remediation was applied; gateway's own replicas were healthy throughout.

## Impact
A brief gateway 5xx blip, insufficient to leave any measurable trace in the 5xx counters by the time of investigation (10m/30m/1h increase queries all read 0 for `/v1/chat` 5xx status codes at time of investigation). No sustained user-facing outage — the SLO error-ratio recording rules for 5m/30m/1h were back to 0 within the same evaluation window that raised the page.

## Root cause
The Argo CD Application `platform` has been stuck since the last gitops sync attempt (target revision `61fd55f7560f`, the same revision bundled with the most recent gateway/model-proxy release) retrying a broken sync-hook `Job/seed`. The seed Job crash-loops immediately on every retry (repeated `BackOff` → `BackoffLimitExceeded` across pods `seed-hxrw7`, `seed-xg2gf`, `seed-npk9d`, `seed-f7df7`, `seed-clkhv`, `seed-4rmg2`), consistent with this environment's recurring "retriever crashloop / bad or hardcoded database URL" failure pattern seen in prior postmortems. Argo retried the sync 5 times before giving up (`OperationCompleted ... failed`).

During one of those retry cycles, the resulting pod churn produced a `FailedScheduling` event for a retriever pod (`2 Insufficient memory`) and a transient, non-stable-hash gateway pod identity (`gateway-7f5fcc46-h7zp6`) whose readiness probe failed with `connection refused`. That brief disruption is what tipped gateway's 5xx ratio over the 2% alert threshold. Gateway's actual stable ReplicaSet (hash `69666d8d57`, 4/4 ready) was never unhealthy — the deploy history for gateway/model-proxy themselves shows clean, successful, unrelated syncs.

An older, separate, and already-resolved error spike (thousands of 500/502/504s on `/v1/chat`) was also found in the historical data, tied to an earlier `platform` gitops deploy (`be17fe4e1665`) roughly 5 hours prior — that incident had already fully self-resolved and is unrelated to this page except as evidence of the same `platform`-app fragility.

## What fixed it
Nothing — the incident self-resolved. Argo CD's sync-hook retries for the `platform` Application exhausted (5 retries) and stopped generating further pod churn; gateway's stable replicas continued serving without real errors and the ratio fell back to baseline. Verified via `alert_status` (now inactive, count 0) and a fresh 10-minute 5xx increase query on gateway (0).

No remediation tool in scope (rollout_undo/abort/promote, scale_deployment, patch_memory_limit, restart_workload, update_db_secret) targets the actually-broken component here — the `platform` Application's `seed` hook Job lives in the gitops repo, outside gateway/model-proxy's workload surface — and gateway itself never left a healthy state, so no dry-run/restart was justified.

## Lessons
- The `platform` Application's `seed` sync-hook Job needs its datasource/database configuration fixed at the source (gitops repo) — this is the same class of bug ("bad/hardcoded database URL") that has caused multiple prior retriever crashloop postmortems in this environment; it now also destabilizes gateway indirectly via node pressure and pod churn during Argo's sync retries.
- Consider giving the on-call agent a narrower tool (Argo Application sync/refresh, or Job delete) so a stuck sync-hook Job can be remediated directly instead of only being diagnosable.
- The `DatasourceError` alertname has no matching runbook. One should be authored covering: (1) check `platform`/other Argo Applications for stuck/failing sync operations correlating with the alert window, not just the workload's own rollout, (2) check for sync-hook Job crash-loops and node scheduling pressure as an indirect cause of transient gateway 5xx blips, (3) note that a self-resolved alert with 0 current error-rate still warrants naming the upstream stuck-sync root cause rather than closing as "no action needed."
