# Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 14:58:42Z
- **Resolved:** 2026-07-23 15:03:42Z

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 14:58:10Z | alert | alert firing: SLO gateway availability — fast burn |
| 14:58:10Z | alert | alert resolved: SLO gateway availability — fast burn |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-xvhz7: Created |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-s5sz7: Started |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-s5sz7: Pulled |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Started |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Pulling |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Pulled |
| 14:58:53Z | k8s | Pod/retriever-8665c87798-65lm8: Created |
| 15:00:37Z | deploy:ci | CI run #59 success on postmortem/inc_19f8f7bc0dbcc: obs: postmortem: model-proxy-canary-stall-dq-violation |
| 15:01:16Z | deploy:ci | CI run #60 success on postmortem/inc_19f8f79a3ad5c: obs: postmortem: retriever-single-replica-latency |
| 15:01:22Z | k8s | AnalysisRun/model-proxy-5c6494c8f6-27-1: MetricSuccessful |
| 15:01:22Z | k8s | AnalysisRun/model-proxy-5c6494c8f6-27-1: AnalysisRunSuccessful |
| 15:01:22Z | k8s | Rollout/model-proxy: RolloutStepCompleted |
| 15:01:22Z | k8s | Rollout/model-proxy: AnalysisRunSuccessful |
| 15:01:23Z | k8s | Pod/model-proxy-85597c98d9-l4gxp: Killing |
| 15:01:23Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 15:01:23Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:01:24Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulCreate |
| 15:01:24Z | k8s | Pod/model-proxy-5c6494c8f6-zmn4c: Scheduled |
| 15:01:25Z | k8s | Pod/model-proxy-5c6494c8f6-zmn4c: Started |
| 15:01:25Z | k8s | Pod/model-proxy-5c6494c8f6-zmn4c: Pulled |
| 15:01:25Z | k8s | Pod/model-proxy-5c6494c8f6-zmn4c: Created |
| 15:01:32Z | k8s | Rollout/model-proxy: RolloutStepCompleted |
| 15:01:34Z | k8s | Rollout/model-proxy: AnalysisRunRunning |
| 15:01:54Z | deploy:ci | CI run #61 success on postmortem/inc_19f8f77c9a81d: obs: postmortem: model-proxy-upstream-timeout-5xx |
| 15:02:46Z | k8s | ReplicaSet/embedder-7d999dd67b: SuccessfulCreate |
| 15:02:46Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:02:46Z | k8s | Pod/embedder-7d999dd67b-l46sl: FailedScheduling |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Started |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Pulled |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Created |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Scheduled |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-gtkx5: FailedScheduling |
| 15:03:23Z | deploy:ci | CI run #62 success on postmortem/inc_19f8f7c7371105: obs: postmortem: embedder-single-replica-latency-burn |
| 15:05:03Z | k8s | AnalysisRun/model-proxy-5c6494c8f6-27-3: MetricSuccessful |
| 15:05:03Z | k8s | AnalysisRun/model-proxy-5c6494c8f6-27-3: AnalysisRunSuccessful |
| 15:05:03Z | k8s | Rollout/model-proxy: RolloutStepCompleted |
| 15:05:03Z | k8s | Rollout/model-proxy: AnalysisRunSuccessful |
| 15:05:04Z | k8s | Pod/model-proxy-85597c98d9-sgqz4: Killing |
| 15:05:04Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 15:05:04Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulCreate |
| 15:05:04Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:04Z | k8s | Pod/embedder-7d999dd67b-gtkx5: FailedScheduling |
| 15:05:04Z | k8s | Pod/embedder-7d999dd67b-l46sl: Scheduled |
| 15:05:05Z | k8s | Pod/model-proxy-5c6494c8f6-5gjgb: Started |
| 15:05:05Z | k8s | Pod/model-proxy-5c6494c8f6-5gjgb: Pulled |
| 15:05:05Z | k8s | Pod/model-proxy-5c6494c8f6-5gjgb: Created |
| 15:05:05Z | k8s | Pod/embedder-7d999dd67b-l46sl: Started |
| 15:05:05Z | k8s | Pod/embedder-7d999dd67b-l46sl: Pulled |
| 15:05:05Z | k8s | Pod/embedder-7d999dd67b-l46sl: Created |
| 15:05:05Z | k8s | Pod/model-proxy-5c6494c8f6-5gjgb: Scheduled |
| 15:05:14Z | k8s | Pod/model-proxy-85597c98d9-jdfv5: Killing |
| 15:05:14Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 15:05:14Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:15Z | k8s | Pod/model-proxy-85597c98d9-jdfv5: Unhealthy |
| 15:05:15Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulCreate |
| 15:05:15Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:15Z | k8s | Pod/model-proxy-5c6494c8f6-ghkf9: Scheduled |
| 15:05:16Z | k8s | Pod/model-proxy-5c6494c8f6-ghkf9: Started |
| 15:05:16Z | k8s | Pod/model-proxy-5c6494c8f6-ghkf9: Pulled |
| 15:05:16Z | k8s | Pod/model-proxy-5c6494c8f6-ghkf9: Created |
| 15:05:16Z | remediation | restart_workload model-proxy executed (run run_19f8f7c6853fe) |
| 15:05:18Z | k8s | Rollout/model-proxy: RolloutUpdated |
| 15:05:18Z | k8s | Rollout/model-proxy: NewReplicaSetCreated |
| 15:05:19Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulCreate |
| 15:05:19Z | k8s | Pod/model-proxy-5c6494c8f6-ghkf9: Killing |
| 15:05:19Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulDelete |
| 15:05:19Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:19Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: FailedScheduling |
| 15:05:19Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: Scheduled |
| 15:05:20Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: Started |
| 15:05:20Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: Pulled |
| 15:05:20Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: Created |
| 15:05:28Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulCreate |
| 15:05:28Z | k8s | Pod/model-proxy-5c6494c8f6-5gjgb: Killing |
| 15:05:28Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulDelete |
| 15:05:28Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:28Z | k8s | Pod/model-proxy-85597c98d9-254fq: FailedScheduling |
| 15:05:28Z | k8s | Pod/model-proxy-85597c98d9-254fq: Scheduled |
| 15:05:29Z | k8s | Pod/model-proxy-85597c98d9-254fq: Started |
| 15:05:29Z | k8s | Pod/model-proxy-85597c98d9-254fq: Pulled |
| 15:05:29Z | k8s | Pod/model-proxy-85597c98d9-254fq: Created |
| 15:05:36Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulCreate |
| 15:05:36Z | k8s | Pod/model-proxy-5c6494c8f6-zmn4c: Killing |
| 15:05:36Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulDelete |
| 15:05:36Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:36Z | k8s | Pod/model-proxy-85597c98d9-rsdwx: Scheduled |
| 15:05:37Z | k8s | Pod/model-proxy-85597c98d9-rsdwx: Started |
| 15:05:37Z | k8s | Pod/model-proxy-85597c98d9-rsdwx: Pulled |
| 15:05:37Z | k8s | Pod/model-proxy-85597c98d9-rsdwx: Created |
| 15:05:44Z | k8s | Pod/model-proxy-5c6494c8f6-7tz89: Killing |
| 15:05:44Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulDelete |
| 15:05:45Z | k8s | Pod/model-proxy-d74f868cc-dsfjr: Started |
| 15:05:45Z | k8s | Pod/model-proxy-d74f868cc-dsfjr: Pulled |
| 15:05:45Z | k8s | Pod/model-proxy-d74f868cc-dsfjr: Created |
| 15:05:45Z | k8s | ReplicaSet/model-proxy-d74f868cc: SuccessfulCreate |
| 15:05:45Z | k8s | Pod/model-proxy-d74f868cc-dsfjr: Scheduled |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818722887%22%2C+%22to%22%3A+%221784819022875%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818722887%22%2C+%22to%22%3A+%221784819022875%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
The `SLO gateway availability — fast burn` (sev1) alert fired for tenant acme. Gateway `/v1/chat` requests were intermittently failing with 502s.

## Impact
Gateway availability error budget burned fast (~2% of the 28-day budget in under an hour). During the worst minute, gateway 5xx rate reached roughly 9% of traffic, driven entirely by upstream `model-proxy` failures — `retriever` and `embedder` remained healthy throughout (200s on every call seen in traces).

## Root cause
The gitops sync to revision `be17fe4e1665` (annotation "deploy model-proxy via gitops be17fe4") shipped a broken `model-proxy` canary. A representative trace shows the gateway's `rag.generate` step throwing `UpstreamError: model-proxy returned 500` (`apps/gateway/src/slices/inference/adapters/model-http.ts:21`) while the same trace's calls to `embedder` and `retriever` both returned HTTP 200 — isolating the fault to model-proxy's canary revision specifically, not a shared dependency.

Argo Rollouts' canary AnalysisRun for model-proxy correctly flagged this: the `canary-error-rate` metric assessed `Error` (`consecutiveErrors(5) > consecutiveErrorLimit(4)`), and the rollout got stuck at step 1/4 (`Progressing`), never advancing past the initial 25% traffic weight. Each retry cycle spun up a fresh canary pod and briefly re-exposed ~25% of gateway traffic to the broken revision, producing the periodic 5xx bursts observed in the `traces_spanmetrics_calls_total` series for `gateway`/`model-proxy`/`embedder` — all three moved in lockstep with the error bursts while `retriever` only saw a benign volume increase with zero errors.

Ruled out alternative hypotheses:
- **Stale DB secret**: `secret_age` pre-check showed no rotation (created/modified 4d15h ago, unchanged), and a Loki search for `"password authentication failed"` returned zero hits over the incident window — not the cause.
- **Resource exhaustion / OOM**: `kubectl top` on model-proxy pods showed 10-12m CPU / 63-78Mi memory, well under the 384Mi limit, with zero restarts on the stable pods — not the cause.
- The stable model-proxy ReplicaSet (`85597c98d9`) remained healthy and error-free the entire time; only the canary ReplicaSet (`5c6494c8f6`) associated with the be17fe4e1665 deploy produced errors.

## What fixed it
Restricted to the tools granted for this incident's matched runbooks (no rollout abort/undo access), the applicable mitigation was the `gateway-high-error-rate` runbook's "restart the failing downstream" step. A rolling restart of `deployment/model-proxy` was dry-run, approved by the operator, and executed. `alert_status` was re-queried twice afterward and reported the alert resolved both times, with model-proxy's error-rate metric back at baseline.

Note: a restart clears symptomatic failing pods but does not address the underlying bad canary revision — the Argo Rollout for model-proxy may still resume advancing the same `be17fe4e1665` canary and reproduce the failure. Follow-up below.

## Lessons
- The model-proxy canary from gitops revision `be17fe4e1665` should be rolled back or aborted at the Rollout level (not just pod-restarted) to stop it from being retried; this needs `rollout_abort`/`rollout_undo` access, which this incident's tool grant did not include.
- Argo Rollouts' AnalysisRun already caught this correctly (consecutive-error threshold breached) but kept the rollout retrying indefinitely instead of auto-aborting — worth confirming the rollout's `abortOnFailure` /  retry-limit configuration for model-proxy.
- On-call tooling for this alert class should include rollout-control tools (abort/undo/promote) alongside restart, since a bad-canary root cause is common for gateway-availability burns and a bare restart is only a temporary mitigation.
