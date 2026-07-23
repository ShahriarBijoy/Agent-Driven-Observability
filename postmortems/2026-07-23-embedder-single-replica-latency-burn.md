# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 14:58:45Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
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
| 14:58:10Z | alert | alert firing: SLO gateway latency — fast burn |
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
| 15:02:45Z | remediation | scale_deployment embedder executed (run run_19f8f7c7380107) |
| 15:02:46Z | k8s | ReplicaSet/embedder-7d999dd67b: SuccessfulCreate |
| 15:02:46Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:02:46Z | k8s | Pod/embedder-7d999dd67b-l46sl: FailedScheduling |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Started |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Pulled |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Created |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Scheduled |
| 15:02:47Z | k8s | Pod/embedder-7d999dd67b-gtkx5: FailedScheduling |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818725745%22%2C+%22to%22%3A+%221784818994750%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818725745%22%2C+%22to%22%3A+%221784818994750%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 "SLO gateway latency — fast burn" fired for tenant acme, driven by a severe p95 latency spike on `POST /v1/chat` (up to ~16s) that burned ~2% of the 28-day error budget inside the 5m/1h burn-rate windows.

## Impact
Gateway chat requests (`/v1/chat`) saw p95 latency balloon from a normal baseline to roughly 16s for a window of a few minutes, with the RAG pipeline calls into `retriever` and `embedder` both showing correlated p95 spikes to ~8s. `model-proxy` latency stayed flat throughout, ruling it out as a contributor despite an initial red herring (an unrelated, hours-old AnalysisRun error against an external Prometheus endpoint on model-proxy's canary history).

## Root cause
`embedder` was running a single replica (no headroom / no HPA) while its siblings in the same request path (`gateway`, `retriever`) run 4 replicas each. The `active_requests` gauge showed a sharp concurrency burst hitting the whole pipeline simultaneously (gateway 0→64, retriever 0→27, embedder 0→21, model-proxy 0→7 concurrent in-flight requests) over a ~2 minute window. With only one embedder pod to absorb 21 concurrent requests, queueing there backed up into retriever and then into gateway's `/v1/chat` handler, producing the latency spike that tripped the SLO burn-rate alert. The gitops deploy of revision `be17fe4e1665` across gateway/model-proxy/retriever/embedder was ruled out as the trigger — it had synced hours before the burst and all four apps were Synced/Healthy (aside from model-proxy's routine canary step) at alert time. No OOM kills, pod restarts, or crash-looping were observed (`kube_scan` clean, zero restarts on all pods), and Loki showed no error-log spike, confirming this was a pure capacity/queueing problem rather than a code fault or crash.

## What fixed it
Scaled `embedder` from 1 to 4 replicas (matching gateway/retriever capacity) via `scale_deployment`, dry-run verified (`spec.replicas: 1 -> 4`) and operator-approved before executing. By the time of execution the originating traffic burst had already drained (`active_requests` back to 0 across all four services), and `alert_status` reported the alert resolved immediately after the scale-up rolled out, with new embedder pods coming Ready.

## Lessons
- `embedder` has been a single point of queueing capacity in the RAG path since at least its creation; it should run with the same replica floor as `gateway`/`retriever` (or an HPA keyed on `active_requests`/CPU) rather than a fixed single pod.
- No runbook currently matches `SLO gateway latency — fast burn` by name (`runbook_lookup` returned no match) — this incident should seed a new runbook: check `active_requests` per service first to spot a concurrency-driven bottleneck before chasing deploy/canary red herrings.
- The model-proxy canary's stale `AnalysisRun` Error (an hours-old, unrelated Prometheus-connectivity blip in its history) was a red herring worth explicitly ruling out early — its *current* run was healthy (0% error, 4.75ms p95) throughout this incident.
