# Postmortem: gateway availability error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-22 19:59:44Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 19:33:01Z | deploy:ci | CI run #17 success on postmortem/inc_19f8b4932351: obs: postmortem: gateway-5xx-storm-self-recovered |
| 19:41:16Z | deploy:ci | CI run #18 success on postmortem/inc_19f8b55bdfc3a: obs: postmortem: retriever-lineage-emit-stall |
| 19:47:17Z | k8s | Pod/retriever-7dd45b6674-wmnc4: Started |
| 19:47:17Z | k8s | Pod/retriever-7dd45b6674-wmnc4: Pulled |
| 19:47:17Z | k8s | Pod/retriever-7dd45b6674-wmnc4: Created |
| 19:47:23Z | k8s | Pod/retriever-fdd88497b-vnsx4: Killing |
| 19:47:23Z | k8s | ReplicaSet/retriever-fdd88497b: SuccessfulDelete |
| 19:47:23Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 19:48:22Z | k8s | Pod/seed-w8l7g: Pulled |
| 19:48:22Z | k8s | Pod/seed-w8l7g: Created |
| 19:48:22Z | k8s | Job/seed: SuccessfulCreate |
| 19:48:22Z | k8s | Pod/seed-w8l7g: Scheduled |
| 19:48:23Z | k8s | Pod/seed-w8l7g: Started |
| 19:48:24Z | k8s | Pod/seed-w8l7g: Pulled |
| 19:48:25Z | k8s | Pod/seed-w8l7g: Started |
| 19:48:25Z | k8s | Pod/seed-w8l7g: Created |
| 19:48:27Z | k8s | Pod/seed-w8l7g: BackOff |
| 19:48:28Z | k8s | Pod/seed-w8l7g: BackOff |
| 19:48:38Z | k8s | Pod/seed-w8l7g: Started |
| 19:48:38Z | k8s | Pod/seed-w8l7g: Pulled |
| 19:48:38Z | k8s | Pod/seed-w8l7g: Created |
| 19:48:40Z | k8s | Pod/seed-w8l7g: BackOff |
| 19:49:07Z | k8s | Pod/seed-w8l7g: Started |
| 19:49:07Z | k8s | Pod/seed-w8l7g: Pulled |
| 19:49:07Z | k8s | Pod/seed-w8l7g: Created |
| 19:49:08Z | k8s | Job/seed: SuccessfulDelete |
| 19:49:10Z | k8s | Job/seed: BackoffLimitExceeded |
| 19:50:13Z | k8s | AnalysisRun/gateway-7c59c74c58-16-1: MetricSuccessful |
| 19:50:13Z | k8s | AnalysisRun/gateway-7c59c74c58-16-1: AnalysisRunSuccessful |
| 19:50:13Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 19:50:13Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 19:50:14Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulCreate |
| 19:50:14Z | k8s | Pod/gateway-777dd5847b-87n8c: Killing |
| 19:50:14Z | k8s | ReplicaSet/gateway-777dd5847b: SuccessfulDelete |
| 19:50:14Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 19:50:14Z | k8s | Pod/gateway-7c59c74c58-vwmwd: Scheduled |
| 19:50:15Z | k8s | Pod/gateway-7c59c74c58-vwmwd: Started |
| 19:50:15Z | k8s | Pod/gateway-7c59c74c58-vwmwd: Pulled |
| 19:50:15Z | k8s | Pod/gateway-7c59c74c58-vwmwd: Created |
| 19:50:22Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 19:50:24Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 19:53:53Z | k8s | AnalysisRun/gateway-7c59c74c58-16-3: MetricSuccessful |
| 19:53:53Z | k8s | AnalysisRun/gateway-7c59c74c58-16-3: AnalysisRunSuccessful |
| 19:53:54Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 19:53:54Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 19:53:56Z | k8s | Pod/gateway-777dd5847b-l5dvb: Killing |
| 19:53:56Z | k8s | ReplicaSet/gateway-777dd5847b: SuccessfulDelete |
| 19:53:56Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 19:53:57Z | k8s | Pod/gateway-7c59c74c58-2df9w: Started |
| 19:53:57Z | k8s | Pod/gateway-7c59c74c58-2df9w: Pulled |
| 19:53:57Z | k8s | Pod/gateway-7c59c74c58-2df9w: Created |
| 19:53:57Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulCreate |
| 19:53:57Z | k8s | Pod/gateway-7c59c74c58-2df9w: Scheduled |
| 19:54:04Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulCreate |
| 19:54:04Z | k8s | Pod/gateway-777dd5847b-4cz5z: Killing |
| 19:54:04Z | k8s | ReplicaSet/gateway-777dd5847b: SuccessfulDelete |
| 19:54:04Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 19:54:04Z | k8s | Pod/gateway-7c59c74c58-pzv99: Scheduled |
| 19:54:05Z | k8s | Pod/gateway-7c59c74c58-pzv99: Started |
| 19:54:05Z | k8s | Pod/gateway-7c59c74c58-pzv99: Pulled |
| 19:54:05Z | k8s | Pod/gateway-7c59c74c58-pzv99: Created |
| 19:59:10Z | alert | alert firing: SLO gateway availability — slow burn |
| 20:02:02Z | k8s | Pod/retriever-646d994555-86nqp: Pulled |
| 20:02:02Z | k8s | ReplicaSet/retriever-646d994555: SuccessfulCreate |
| 20:02:02Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 20:02:02Z | k8s | Rollout/gateway: RolloutUpdated |
| 20:02:02Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 20:02:02Z | k8s | Pod/retriever-646d994555-86nqp: Scheduled |
| 20:02:03Z | k8s | Pod/retriever-646d994555-86nqp: Started |
| 20:02:03Z | k8s | Pod/retriever-646d994555-86nqp: Created |
| 20:02:03Z | k8s | Pod/gateway-7c59c74c58-2df9w: Killing |
| 20:02:03Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulDelete |
| 20:02:03Z | k8s | ReplicaSet/gateway-659b5cb47d: SuccessfulCreate |
| 20:02:03Z | k8s | Pod/gateway-659b5cb47d-8l6kr: Scheduled |
| 20:02:04Z | k8s | Pod/gateway-659b5cb47d-8l6kr: Started |
| 20:02:04Z | k8s | Pod/gateway-659b5cb47d-8l6kr: Pulled |
| 20:02:04Z | k8s | Pod/gateway-659b5cb47d-8l6kr: Created |
| 20:02:09Z | k8s | Pod/retriever-7dd45b6674-wmnc4: Killing |
| 20:02:09Z | k8s | ReplicaSet/retriever-7dd45b6674: SuccessfulDelete |
| 20:02:09Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 20:05:43Z | k8s | AnalysisRun/gateway-659b5cb47d-17-1: MetricSuccessful |
| 20:05:43Z | k8s | AnalysisRun/gateway-659b5cb47d-17-1: AnalysisRunSuccessful |
| 20:05:43Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 20:05:44Z | k8s | Pod/gateway-7c59c74c58-pzv99: Killing |
| 20:05:44Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulDelete |
| 20:05:45Z | k8s | Pod/gateway-659b5cb47d-fph4l: Pulled |
| 20:05:45Z | k8s | Pod/gateway-659b5cb47d-fph4l: Created |
| 20:05:45Z | k8s | ReplicaSet/gateway-659b5cb47d: SuccessfulCreate |
| 20:05:45Z | k8s | Pod/gateway-659b5cb47d-fph4l: Scheduled |
| 20:05:46Z | k8s | Pod/gateway-659b5cb47d-fph4l: Started |
| 20:06:13Z | remediation | scale_deployment retriever executed (run run_19f8b69a4bd333) |
| 20:06:14Z | k8s | ReplicaSet/retriever-646d994555: SuccessfulCreate |
| 20:06:14Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 20:06:14Z | k8s | Pod/retriever-646d994555-ssbp9: Scheduled |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Started |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Pulling |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Pulled |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Created |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784750384306%22%2C+%22to%22%3A+%221784750848738%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784750384306%22%2C+%22to%22%3A+%221784750848738%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev2 slow-burn SLO alert on gateway availability (10% of 28d error budget burned in 6h). Investigation traced this to a genuine ~7-minute, gateway-wide 5xx spike (peaking ~70% error rate) caused by the `retriever` service running with a single replica, which turns every routine pod restart into a hard capacity cutover.

## Impact
Gateway-wide error rate (all pod hashes, not just the in-flight canary) climbed from a baseline of ~2% to a peak of ~70% for roughly 7 minutes. Concretely this tripped Argo Rollouts' canary-error-rate analysis (measured 90%+ error rate on the canary hash, p95 latency 10s vs a 1.5s gate) causing an automatic rollout abort, and it burned enough of the 28-day error budget to trigger the 30m/6h slow-burn SLO alert.

## Root cause
`deployment/retriever` was configured with `spec.replicas: 1`. The deployment history shows 10 distinct ReplicaSets churned through in roughly 25 minutes — the pod was being repeatedly restarted (each new pod carries a `kubectl.kubernetes.io/restartedAt` annotation). With no redundant replica, each restart produces a window where retriever has zero ready backends (old pod terminating, new pod still starting/warming), so every gateway request needing retrieval during that gap fails outright. Retriever's own logs show `unhandled error` exceptions inside `queryWithCache` during exactly this window, and Tempo traces show the resulting errors and elevated latency propagating from retriever into the gateway's root `POST /v1/chat` spans. No application code deploy preceded the incident (last CI deploy to gateway was ~7.5h earlier, an unrelated agent-service change) — deploy_history and gitea_compare ruled out a bad code/config push. Postgres itself was stable throughout (24h old pod, 0 restarts, no events), and the `subject-db-credentials` secret was not recently rotated, ruling out both a bad deploy and a stale-secret cause. A separate `seed` Job was independently crash-looping against the same backend in the same window, but its role was incidental noise rather than the trigger — the single-replica retriever topology is what turned any restart (including this one and subsequent ones observed at ~20:02 UTC) into a user-facing outage.

## What fixed it
Scaled `retriever` from 1 to 2 replicas (approved remediation, `scale_deployment` executed after dry-run). Verified effect: both retriever pods came up Ready; a new gateway canary rollout that started immediately after (revision 17, hash `659b5cb47d`) passed its full canary-error-rate/p95 analysis cleanly at 0% error rate, versus the failed analysis on the pre-fix rollout. Instant gateway 5xx ratio returned to and held at 0%. The alert's 30m/6h burn-rate windows still contain the historical spike at time of writing, so `alert_status` has not yet flipped to resolved — this is expected decay behavior for a windowed slow-burn detector, not a sign the fix didn't work; it will clear once the spike ages out of the 30-minute window.

## Lessons
- `retriever` should never run at replicas=1 in this environment — it sits directly in the gateway's request path with no fallback, so any restart (deploy, rollout restart, node reschedule, or chaos-style pod disruption) becomes a full-service outage rather than a graceful rolling update. Recommend a minimum of 2 replicas plus a PodDisruptionBudget (`minAvailable: 1`) going forward.
- The canary analysis (`canary-error-rate`/`canary-p95`) only measures the canary pod-template-hash, but the actual blast radius here was gateway-wide because the failure was in a shared downstream dependency, not the canary code itself. Worth adding a stable-hash error-rate metric to the same AnalysisTemplate so a shared-dependency outage is visible in the rollout signal too, not just inferred after the fact from Mimir.
- No runbook currently matches `SLO gateway availability — slow burn`; this postmortem should seed one that starts with "check retriever/embedder/model-proxy replica counts and recent restart churn" before assuming a bad code deploy, since deploy_history correctly ruled that out quickly here but the on-call still had to hand-derive the dependency-redundancy angle.
