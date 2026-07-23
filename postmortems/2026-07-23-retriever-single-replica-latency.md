# Postmortem: gateway p95 latency above 2s

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 14:55:41Z
- **Resolved:** 2026-07-23 15:00:41Z

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 14:55:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 14:55:10Z | alert | alert resolved: Gateway p95 latency > 2s |
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
| 14:58:50Z | remediation | scale_deployment retriever executed (run run_19f8f79a3bc5e) |
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

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818541487%22%2C+%22to%22%3A+%221784818841460%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784818541487%22%2C+%22to%22%3A+%221784818841460%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 alert "Gateway p95 latency > 2s" fired for tenant acme. Investigation found the gateway itself was healthy; the latency originated in the `retriever` service's `/v1/retrieve` call, which is on the hot path of every `POST /v1/chat` request (`rag.retrieve` span dominated end-to-end trace duration, e.g. 2.5s of a 3.2s total request).

## Impact
Gateway `/v1/chat` p95 rose from a normal ~5-100ms baseline to a peak of ~9-10s, driven almost entirely by `/v1/retrieve` p95 spiking from ~4.75ms to a peak of 8.6s. Traces confirmed 200-status (non-error) responses, so this was a pure latency degradation, not a correctness/error incident — but well outside SLO for a sev1.

## Root cause
`retriever` runs as a single-replica Deployment (1/1, no HPA) with no CPU limit and a 100m CPU request. Request volume to `/v1/retrieve` (and the correlated `inferences` write rate in Postgres) roughly quadrupled in a short window — from ~4 req/s to ~15.8 req/s — consistent with a load-generator traffic burst. With only one instance handling all concurrent chat requests, retriever queued incoming requests rather than processing them in parallel, and p95 latency scaled directly with the queue depth.

This was confirmed, not assumed: `container_cpu_usage_seconds_total` for the retriever pod stayed flat at ~1.3% (~0.013 cores) throughout the spike, and Postgres CPU stayed flat at ~2-3% — ruling out CPU starvation, DB compute overload, or query-plan regression as the mechanism. The single `POST /v1/retrieve` server span itself accounted for the multi-second duration with no heavy internal work visible, matching a queueing/serialization signature rather than a slow computation.

Ruled out:
- Bad deploy — the last gitops deploy (gateway/model-proxy, commit ref be17fe4) landed ~68 minutes before alert onset, and both Argo Rollouts were already `Healthy` at step 4/4 well before the alert fired.
- Stale canary analysis errors for gateway/model-proxy (`consecutiveErrors > consecutiveErrorLimit` against the Mimir endpoint) — these were from the prior day (2026-07-22 ~23:55) and unrelated to this incident.
- Pod crash/OOM/restart — all pods were Ready throughout with 0 restarts and no notable k8s events.
- Secret rotation / stale-secret issue — DB credentials secret was last touched 4d15h ago, not implicated.

## What fixed it
Scaled the `retriever` Deployment from 1 to 4 replicas (dry-run diff `spec.replicas: 1 -> 4` verified, operator-approved, then applied). All 4 replicas reached Ready. `/v1/retrieve` p95 was observed trending down immediately after (from a peak ~7.8s down through ~2.4s) as load spread across instances, and the traffic burst itself also subsided to near-zero shortly after. However, repeated `alert_status` polling after the fix continued to show the alert as still `active` with an unchanged `since` timestamp — recovery was not confirmed server-side by the time this report was closed. This is called out explicitly rather than assumed: the improving latency trend and healthy replica count are good signals, but the alert's own resolution signal had not flipped after several minutes of checking, possibly due to the alert rule's evaluation/hold-down window not yet rolling fully past the incident once traffic (and therefore fresh samples) stopped.

## Lessons
- `retriever` is a single point of serialization on the RAG hot path with no autoscaling and no CPU limit — it should get a floor of at least 2-3 replicas and an HPA keyed on request latency/concurrency, not just CPU (CPU stayed low even while queueing badly).
- No runbook currently matches "Gateway p95 latency > 2s" by name; the closest match (`gateway-high-error-rate.md`) is scoped to 5xx rate, not latency, and its "check downstream health" step doesn't point at per-service p95/queueing. A new runbook should cover: check downstream p95 broken out by route, check replica count of each downstream, and check CPU-vs-latency divergence as the queueing signature.
- Recovery verification for latency-based alerts is harder when the offending traffic itself stops — consider a synthetic canary request path so p95 recovery can be verified independent of real traffic volume.
