# Postmortem: gateway 5xx rate above 2%

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 14:53:40Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 14:53:10Z | alert | alert firing: Gateway 5xx rate > 2% |
| 14:57:39Z | remediation | restart_workload model-proxy executed (run run_19f8f77c9d51f) |
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
| 15:00:37Z | deploy:ci | CI run #59 in_progress on postmortem/inc_19f8f7bc0dbcc: obs: postmortem: model-proxy-canary-stall-dq-violation |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818420138%22%2C+%22to%22%3A+%221784818858011%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818420138%22%2C+%22to%22%3A+%221784818858011%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Gateway 5xx rate exceeded 2% (sev1), driven entirely by the `/v1/chat` route, which fans out to `model-proxy`'s `/v1/complete`.

## Impact
Tenant `acme` (and others) saw elevated 500/502/504 responses on `/v1/chat`, rising from ~1.6% to ~7.5% 5xx share as traffic ramped, before remediation.

## Root cause
Both `gateway` and `model-proxy` were promoted to a new revision via gitops commit `be17fe4` (Argo Rollout `gateway` → revision 42/`6b45d8cc6c`, `model-proxy` → revision 26/`85597c98d9`). During that canary, the `canary-error-rate` AnalysisRun for both workloads already recorded `consecutiveErrors (5) > consecutiveErrorLimit (4)` — a clear pre-promotion warning — yet the rollout completed full promotion anyway.

Once real `/v1/chat` traffic ramped up, the defect became visible: `model-proxy` began hanging for almost exactly ~30s on a subset of `/v1/complete` requests before failing with 500, while `gateway`'s own client-side call to `model-proxy` enforces a much shorter 8000ms timeout (`UpstreamTimeoutError: model-proxy timed out after 8000ms`, thrown from `apps/gateway/src/platform/upstream.ts`). That mismatch turned every slow `model-proxy` request into a 502/504 at the gateway.

Ruled out alternatives with evidence:
- **Stale DB secret**: secret last rotated 4d15h ago (long before this window); no "password authentication failed" log lines found — not the cause.
- **New/unrelated deploy at alert time**: `deploy_history` showed no deploy in the 60 minutes immediately before the alert; the only relevant change was the `be17fe4` gitops sync ~66 minutes prior, whose canary had already misbehaved.
- **Resource exhaustion**: `model-proxy` pods were using 11-18m CPU / 67-93Mi memory, far under their 384Mi limit — not OOM/CPU-throttling related.
- **Retriever/embedder**: both stayed fast and error-free throughout (verified via traces and per-route metrics), isolating the fault to `model-proxy` alone.

## What fixed it
Rolling-restarted `deployment/model-proxy` (approved remediation). Gateway 5xx share dropped to 0% within a couple of minutes across 1m/2m/3m/5m windows, and `alert_status` subsequently reported the alert resolved.

## Lessons
- The Argo Rollout for `model-proxy` (and `gateway`) promoted to Healthy/step 4-of-4 despite its own AnalysisRun recording `consecutiveErrors` past the configured limit — the promotion gate did not actually block on that failure. This should be tightened so a `canary-error-rate` Error verdict halts/aborts promotion rather than completing it.
- `gateway`'s upstream timeout to `model-proxy` (8000ms) is inconsistent with `model-proxy`'s own effective processing time under load (~30000ms) for at least a subset of requests. Either `model-proxy`'s slow path needs to be fixed/bounded well under 8s, or the timeouts need to be aligned with a fast-fail/circuit-breaker instead of letting client and server disagree on the deadline.
- Canary analysis errors during a rollout should page or block automatically rather than surface only as a passive pre-check lead discovered after the fact.
