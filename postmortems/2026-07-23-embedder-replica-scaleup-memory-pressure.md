# Postmortem: subject/embedder available replicas != spec for 2 minutes

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-23 15:05:51Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:00:37Z | deploy:ci | CI run #59 success on postmortem/inc_19f8f7bc0dbcc: obs: postmortem: model-proxy-canary-stall-dq-violation |
| 15:01:16Z | deploy:ci | CI run #60 success on postmortem/inc_19f8f79a3ad5c: obs: postmortem: retriever-single-replica-latency |
| 15:01:22Z | log-spike | log-spike onset: name=model-proxy-5c6494c8f6-27-1 kind=AnalysisRun objectAPIversion=argoproj.io/v1alpha1 objectRV=386834 eventRV=386881 reportingcontroller=rollouts-controller sourcecomponent=rollouts-controller reason=MetricSuccessful type=Normal count=1 msg="Metric 'canary-error-rate' Completed. Result: Successful"  |
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
| 15:05:18Z | k8s | Rollout/model-proxy: RolloutUpdated |
| 15:05:18Z | k8s | Rollout/model-proxy: NewReplicaSetCreated |
| 15:05:19Z | k8s | ReplicaSet/model-proxy-85597c98d9: SuccessfulCreate |
| 15:05:19Z | k8s | Pod/model-proxy-5c6494c8f6-ghkf9: Killing |
| 15:05:19Z | k8s | ReplicaSet/model-proxy-5c6494c8f6: SuccessfulDelete |
| 15:05:19Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:05:19Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: FailedScheduling |
| 15:05:19Z | k8s | Pod/model-proxy-85597c98d9-v9g2g: Scheduled |
| 15:05:20Z | alert | alert firing: KubeDeploymentReplicasMismatch |
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
| 15:08:09Z | remediation | scale_deployment embedder executed (run run_19f8f82f1be314) |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819151284%22%2C+%22to%22%3A+%221784819383375%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819151284%22%2C+%22to%22%3A+%221784819383375%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
KubeDeploymentReplicasMismatch fired for `subject/embedder`: the Deployment's spec.replicas jumped from 1 to 4 but only 3 pods could be scheduled, leaving it stuck at 3/4 available.

## Impact
One embedder replica (`embedder-7d999dd67b-gtkx5`) sat Pending indefinitely, repeatedly failing scheduling. No user-facing outage — the other 3 replicas stayed healthy and serving — but the deployment was in a degraded/mismatched state and the extra scheduling pressure was also visible on model-proxy's canary rollout pods, which saw transient FailedScheduling events in the same window.

## Root cause
The embedder Deployment was scaled from 1 → 4 replicas out-of-band (no HPA is configured for embedder — confirmed via `kubectl get hpa` returning empty — and Argo CD reported embedder as OutOfSync, i.e. the live replica count diverged from the tracked gitops revision). This coincided with a just-landed postmortem CI run for a prior "embedder-single-replica-latency-burn" incident, consistent with the scale-up being a well-intentioned but oversized remediation for that earlier single-replica-latency problem.

The cluster's two schedulable worker nodes (k3d-obs-lab-agent-0/1; the server node is tainted and not used for workload pods) only have ~2.05Gi allocatable memory each, and were already carrying ~1-1.8Gi of requests from gateway/retriever/model-proxy plus model-proxy's concurrent canary rollout pod. There was no headroom for a 4th 192Mi-request embedder pod, so the scheduler correctly rejected it with "Insufficient memory" on both eligible nodes, matching the FailedScheduling events observed for embedder and (transiently) for model-proxy.

## What fixed it
Scaled the embedder Deployment back down from 4 to 3 replicas (dry-run diff `spec.replicas: 4 -> 3`, approved by operator, then executed for real). This matched the desired replica count to the 3 pods that were already healthy and running, immediately clearing the unschedulable 4th pod (it was deleted by the ReplicaSet controller) and resolving the mismatch. Verified via kubectl (3/3 ready/available), Mimir's `kube_deployment_spec_replicas`/`kube_deployment_status_replicas_available` (both settled at 3), and finally `alert_status`, which reported the alert cleared.

## Lessons
- No HPA exists for embedder, so any replica-count change is manual/out-of-band and won't be capacity-checked before being applied — this is exactly how a well-meant latency fix turned into a capacity incident.
- The two schedulable worker nodes are running very thin on allocatable memory (~2Gi each); any coordinated replica bump across embedder/gateway/model-proxy (e.g. during a canary rollout) can exhaust it. Worth adding a memory-headroom dashboard/alert and considering either a cluster-autoscaler-equivalent, a documented safe replica ceiling per node pool, or tighter memory requests before repeating this class of remediation.
- Argo showing embedder as OutOfSync was a useful early signal of drift and should be treated as a lead in future incidents on this workload.
- No runbook currently matches KubeDeploymentReplicasMismatch — worth authoring one covering: check HPA existence, check Argo sync/drift, check node allocatable-vs-requested memory, and the scale-to-match-healthy-count remediation used here.
