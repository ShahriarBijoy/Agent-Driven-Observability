# Postmortem: Gateway 5xx rate > 2% (storm acceptance test)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 19:24:17Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:00:00Z | alert | alert firing: gw-5xx |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784748257847%22%2C+%22to%22%3A+%221784748773375%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784748257847%22%2C+%22to%22%3A+%221784748773375%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
`gw-5xx` (sev1, tenant acme, "Gateway 5xx rate > 2% (storm acceptance test)") paged. A prior investigation pass in this same incident flagged continued impact and a deploy trigger in progress (gitops revision b30568f) but could not confirm recovery. On re-examination, every independent signal now agrees the incident is over and has been for hours: `alert_status` reports inactive (confirmed on four separate checks spaced across the investigation), the gateway 5xx ratio has been flat at 0% for the entire available telemetry window (20h, well before and after the deploy), the Argo Rollouts for gateway and model-proxy are both Healthy at step 4/4, and every gateway/model-proxy/retriever/embedder pod is Running with 0 restarts and 6h57m-7h6m of uptime.

## Impact
Gateway 5xx rate crossed the 2% burn threshold for tenant acme, triggering a sev1 page. Current telemetry shows no residual customer-facing impact: request volume is steady (~1.3 req/s, mostly health-check traffic) with a 0% error share across the full queried history.

## Root cause
The prior diagnosis's concern was evidence-backed at the time but incomplete: it caught an Argo deploy (gitops commit b30568f, image e952987, from CI run #16 merging PR #15) mid-rollout and read the in-flight canary as unresolved risk rather than the fix landing. `deploy_history` over a 24h window shows this was the only deploy in the incident's vicinity — the previous stable revision (81e0716) had been running untouched for the prior ~16 hours, so this was not a second bad deploy stacking on the first. CI run #16 completed successfully (not stuck/red), the gitops sync completed, and the rollout has since reached step 4/4 Healthy with zero 5xx in its wake. The two candidate hypotheses from the matched runbooks were both checked and ruled out with evidence: no `password authentication failed` lines in Loki over the incident window, and the `subject-db-credentials` secret is 3d20h old (no recent rotation), so this was not the stale-secret pattern; and no auth or downstream-health-check failures appear in gateway logs.

## What fixed it
No remediation was executed in this pass. The redeploy of gateway/model-proxy/retriever/embedder/load-generator to b30568f (image e952987) that was already in flight during the earlier check is what ended the error storm — by the time this investigation restarted, that rollout had already completed and the system had been stable and error-free for roughly 7 hours. Re-querying `alert_status` four times across the investigation returned `active: false` every time, and `restart_workload`/`update_db_secret` were withheld deliberately since no live evidence justified touching a healthy system.

## Lessons
- A rollout observed mid-flight can look like unresolved impact; re-check `rollout`/deploy state a little later before concluding a fix "didn't take" — step 4/4 Healthy is the signal to wait for, not the deploy annotation alone.
- The alert summary's own "(storm acceptance test)" tag is a hint this may be a synthetic exercise; regardless, we still required real telemetry (0% 5xx, healthy rollout, clean logs, stable pods) before declaring recovery rather than trusting the label.
- Consider a short post-deploy soak check in the runbook (re-query error rate ~10-15 min after a rollout reaches Healthy) so a future on-call doesn't need a second pass to confirm a fix actually landed.
