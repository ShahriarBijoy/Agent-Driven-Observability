# Postmortem: a high-severity data-quality violation fired in the last 5 minutes

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 14:58:00Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 14:57:30Z | alert | alert firing: DQ high-severity violation |
| 14:57:41Z | k8s | Rollout/model-proxy: RolloutUpdated |
| 14:57:41Z | k8s | Rollout/model-proxy: RolloutNotCompleted |
| 14:57:41Z | k8s | Rollout/model-proxy: NewReplicaSetCreated |
| 14:57:42Z | k8s | Pod/model-proxy-85597c98d9-ltg6p: Killing |
| 14:57:42Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 14:57:42Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 14:57:43Z | k8s | Pod/model-proxy-5c6494c8f6-7tz89: Pulled |
| 14:57:43Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulCreate |
| 14:57:43Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 14:57:43Z | k8s | Pod/model-proxy-5c6494c8f6-7tz89: Scheduled |
| 14:57:44Z | k8s | Pod/model-proxy-5c6494c8f6-7tz89: Started |
| 14:57:44Z | k8s | Pod/model-proxy-5c6494c8f6-7tz89: Created |
| 14:57:51Z | k8s | Rollout/model-proxy: RolloutStepCompleted |
| 14:57:53Z | k8s | Rollout/model-proxy: AnalysisRunRunning |
| 14:58:52Z | k8s | Pod/retriever-8665c87798-xvhz7: Pulled |
| 14:58:52Z | k8s | ReplicaSet/retriever-8665c87798: SuccessfulCreate |
| 14:58:52Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 14:58:52Z | k8s | Pod/retriever-8665c87798-65lm8: Scheduled |
| 14:58:52Z | k8s | Pod/retriever-8665c87798-xvhz7: Scheduled |
| 14:58:52Z | k8s | Pod/retriever-8665c87798-s5sz7: Scheduled |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-xvhz7: Started |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-xvhz7: Created |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-s5sz7: Started |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-s5sz7: Pulled |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-s5sz7: Created |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Started |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Pulling |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Pulled |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Created |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818680028%22%2C+%22to%22%3A+%221784818830381%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818680028%22%2C+%22to%22%3A+%221784818830381%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 "DQ high-severity violation" fired for tenant acme (dashboard/alert scoping), but investigation shows the underlying event is not tenant-specific: the entire inference pipeline stalled for every tenant simultaneously (acme, bravo, abuser all show `low_volume` ratio 0.0 in `dq_violations`).

## Impact
All completions traffic stopped. `inferences` and `usage_events` writes fell in lockstep from a healthy ~600-790 rows/min to exactly zero across all tenants. No error-status rows were logged in `inferences` in the affected window — requests are not failing-and-being-recorded, they are not completing at all. This is a full outage of the inference path, not a data-quality edge case.

## Root cause
The model-proxy Argo Rollout was gitops-synced to revision `be17fe4e1665` (annotation: "deploy model-proxy via gitops be17fe4"). Its canary got stuck Progressing at step 1/4: the `canary-error-rate` AnalysisRun assessed Error, tripping `consecutiveErrors(5) > consecutiveErrorLimit(4)` against probe failures reported as a malformed `Post http:/…` target. The gateway rollout from the same gitops commit reports Healthy, so the regression is isolated to the model-proxy revision's canary. This stuck/broken canary is what took down the whole model-proxy path and, downstream, stopped every tenant's `inferences`/`usage_events` writes — which the dq-runner correctly caught as a simultaneous low-volume violation across acme, bravo, and abuser.

The runbook matched by alert routing (`dq-freshness-stall.md`) assumes a single dataset's producing job or the dq-runner itself failed independently, and its mitigation steps (restart the producing job / restart dq-runner / start the load generator) do not address a broken canary rollout. The dq-runner itself is healthy and correctly detecting the symptom — it is not the fault.

## What fixed it
Nothing yet. The corrective action — abort or roll back the stuck model-proxy canary (revision be17fe4e1665) via `rollout_abort`/`rollout_undo` — requires rollout-management tools that were not part of this incident's granted toolset (scoped to alert/deploy/metrics/DB read tools plus approval and postmortem tooling only). No remediation was executed. The alert is still active as of the last check. This needs escalation to an operator/agent session with rollout-management permissions to abort or roll back the model-proxy Rollout to the previous healthy revision.

## Lessons
- The alertname-to-runbook mapping for "DQ high-severity violation" routes to a freshness-stall runbook that assumes independent producer/dq-runner failure. It should also branch on "all tenants zero simultaneously" as a distinct signature pointing at the shared upstream service (gateway/model-proxy), with a mitigation path of checking the Argo Rollout/AnalysisRun state, not just the producing job.
- Tenant-scoped low-volume checks correctly correlated across tenants; consider adding a "cross-tenant simultaneous zero" high-priority classification so on-call routes straight to rollout/infra checks instead of dataset-level ones.
- This on-call session's tool grant for this alert type does not include rollout remediation tools (`rollout_abort`/`rollout_undo`/`rollout_status`). Either broaden the grant for this alert class, or ensure the paging/escalation path hands off to an agent/operator who has them, since the actual fix could not be applied here.
