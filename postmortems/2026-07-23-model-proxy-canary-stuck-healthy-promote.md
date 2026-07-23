# Postmortem: rollout model-proxy has been Progressing >12m or is short on ready replicas - likely a wedged canary (never-Ready pods, stuck analysis, or image that cannot start); rollout_status + analysisrun_get have the detail

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-23 15:11:29Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:00:37Z | deploy:ci | CI run #59 success on postmortem/inc_19f8f7bc0dbcc: obs: postmortem: model-proxy-canary-stall-dq-violation |
| 15:01:16Z | deploy:ci | CI run #60 success on postmortem/inc_19f8f79a3ad5c: obs: postmortem: retriever-single-replica-latency |
| 15:01:54Z | deploy:ci | CI run #61 success on postmortem/inc_19f8f77c9a81d: obs: postmortem: model-proxy-upstream-timeout-5xx |
| 15:02:46Z | log-spike | log-spike onset: name=embedder-7d999dd67b-l46sl kind=Pod action=Scheduling objectAPIversion=v1 objectRV=387072 eventRV=387080 reportinginstance=default-scheduler-k3d-obs-lab-server-0 reportingcontroller=default-scheduler reason=FailedScheduling type=Warning msg="0/3 nodes are available: 1 node(s) had untolerated taint(s), 2 Insufficient memory. no new claims to deallocate, preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod."  |
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
| 15:05:54Z | deploy:ci | CI run #63 success on postmortem/inc_19f8f7c6846fc: obs: postmortem: model-proxy-canary-500s-gateway-avail-burn |
| 15:08:11Z | k8s | ReplicaSet/embedder-7d999dd67b: SuccessfulDelete |
| 15:08:11Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:09:23Z | k8s | AnalysisRun/model-proxy-d74f868cc-28-1: MetricSuccessful |
| 15:09:23Z | k8s | AnalysisRun/model-proxy-d74f868cc-28-1: AnalysisRunSuccessful |
| 15:09:23Z | k8s | Rollout/model-proxy: AnalysisRunSuccessful |
| 15:09:24Z | k8s | ReplicaSet/model-proxy-d74f868cc: SuccessfulCreate |
| 15:09:24Z | k8s | Pod/model-proxy-85597c98d9-254fq: Killing |
| 15:09:24Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 15:09:24Z | k8s | Pod/model-proxy-d74f868cc-bx54b: Scheduled |
| 15:09:25Z | k8s | Pod/model-proxy-d74f868cc-bx54b: Started |
| 15:09:25Z | k8s | Pod/model-proxy-d74f868cc-bx54b: Pulled |
| 15:09:25Z | k8s | Pod/model-proxy-d74f868cc-bx54b: Created |
| 15:09:51Z | deploy:ci | CI run #64 success on postmortem/inc_19f8f82f1b3312: obs: postmortem: embedder-replica-scaleup-memory-pressure |
| 15:10:50Z | alert | alert firing: Rollout stuck (progressing too long / replicas short) |
| 15:11:22Z | deploy:ci | CI run #65 success on postmortem/inc_19f8f83e0ed32e: obs: postmortem: embedder-scale-insufficient-memory-scheduling |
| 15:12:15Z | deploy:ci | CI run #66 success on postmortem/inc_19f8f81127e275: obs: postmortem: rag-quality-chronic-low-relevance-single-doc-corpus |
| 15:13:03Z | k8s | AnalysisRun/model-proxy-d74f868cc-28-3: MetricSuccessful |
| 15:13:03Z | k8s | AnalysisRun/model-proxy-d74f868cc-28-3: AnalysisRunSuccessful |
| 15:13:03Z | k8s | Rollout/model-proxy: AnalysisRunSuccessful |
| 15:13:04Z | k8s | Pod/model-proxy-85597c98d9-rsdwx: Killing |
| 15:13:04Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 15:13:05Z | k8s | Pod/model-proxy-d74f868cc-5h4h7: Pulled |
| 15:13:05Z | k8s | Pod/model-proxy-d74f868cc-5h4h7: Created |
| 15:13:05Z | k8s | ReplicaSet/model-proxy-d74f868cc: SuccessfulCreate |
| 15:13:05Z | k8s | Pod/model-proxy-d74f868cc-5h4h7: Scheduled |
| 15:13:06Z | k8s | Pod/model-proxy-d74f868cc-5h4h7: Started |
| 15:13:13Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: Killing |
| 15:13:13Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulDelete |
| 15:13:14Z | k8s | Pod/model-proxy-d74f868cc-mjflc: Pulled |
| 15:13:14Z | k8s | Pod/model-proxy-d74f868cc-mjflc: Created |
| 15:13:14Z | k8s | ReplicaSet/model-proxy-d74f868cc: SuccessfulCreate |
| 15:13:14Z | k8s | Pod/model-proxy-d74f868cc-mjflc: Scheduled |
| 15:13:15Z | k8s | Pod/model-proxy-d74f868cc-mjflc: Started |
| 15:13:21Z | remediation | rollout_promote model-proxy executed (run run_19f8f88190147f) |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819489018%22%2C+%22to%22%3A+%221784819658510%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819489018%22%2C+%22to%22%3A+%221784819658510%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev2 page fired for "Rollout stuck (progressing too long / replicas short)" on the model-proxy Argo Rollout. Investigation found a metrically healthy canary that had simply not finished its staged rollout steps within the alert's stuck-progressing window.

## Impact
No customer-facing error-rate or latency regression at any point. model-proxy served traffic normally throughout via the stable replica set while the canary replica set (50% of desired replicas at the time of paging) advanced through its analysis steps.

## Root cause
The model-proxy Rollout was legitimately progressing, not wedged by a bad change. At alert time it was on step 3/4 (setWeight 50 → canary-analysis), with the AnalysisRun `model-proxy-d74f868cc-28-3` in `Running` phase (not `Failed`/`Error`). Both this run and the two prior AnalysisRuns for the same rollout (`model-proxy-d74f868cc-28-1`, `model-proxy-5c6494c8f6-27-3`) reported clean measurements throughout: canary-error-rate consistently `0`, canary-p95 latency stable around 4.7–4.8ms, across 18 total measurements. Replica counts were also never actually short — `ready=4/available=4/desired=4` at all times; only `updated` (2/4) reflected the in-progress canary weight, which the alert's "replicas short" wording can conflate with genuine unavailability. The rollout crossed the alert's stuck-progressing time budget purely because of how many analysis steps/cycles it had queued through in a short window, not because of any regression in the code or config being rolled out (canary and stable were built from the same gitops revision `be17fe4e1665`).

This matches the runbook's third candidate hypothesis: a legitimately progressing, slow-but-healthy rollout tripping the stuck-rollout alert, as opposed to a genuine AnalysisRun failure (ruled out — no failed/errored measurements at any point) or a canary that never went Ready (ruled out — replicas were ready/available throughout).

## What fixed it
Per the canary-abort runbook's guidance not to reflexively roll back a healthy canary, `rollout_promote` (full promote, skipping remaining steps/analysis) was dry-run, approved by the operator with the AnalysisRun evidence attached, and executed. Immediately after, `rollout_status` showed the rollout at step 4/4, phase `Healthy`, stable hash and canary hash converged to `d74f868cc`, and all 4/4 replicas updated/ready/available.

## Lessons
- The resource-level fix (rollout promoted to Healthy) was confirmed within seconds, but `alert_status` for this alert remained `active` with an unchanged `since` timestamp across six consecutive re-checks after the fix — worth checking whether this alert's rule has an unusually long `for:`/evaluation-interval relative to how quickly Argo Rollouts resource state actually converges, since that lag makes a genuinely-fixed rollout look unresolved to on-call for longer than necessary.
- Consider tightening the alert's "replicas short" language/logic to distinguish `updated < desired` (expected during any in-progress canary step) from `ready < desired` or `available < desired` (the actual availability signal), to reduce false urgency on healthy staged rollouts.
