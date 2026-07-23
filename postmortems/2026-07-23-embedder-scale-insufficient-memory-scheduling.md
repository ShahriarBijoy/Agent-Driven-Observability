# Postmortem: more than 2 FailedScheduling events in 5 minutes - a workload is asking for resources the agents don't have

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-23 15:06:52Z
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
| 15:06:20Z | alert | alert firing: KubeFailedScheduling |
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
| 15:10:48Z | remediation | scale_deployment embedder executed (run run_19f8f83e0f3330) |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819212526%22%2C+%22to%22%3A+%221784819473922%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819212526%22%2C+%22to%22%3A+%221784819473922%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
KubeFailedScheduling (sev2) fired for the `subject` namespace after the `embedder` Deployment was scaled from 1 to 4 replicas with no corresponding gitops/Argo sync and no HPA present in the namespace — an ad hoc replica bump, not a code deploy.

## Impact
One `embedder` pod (`embedder-7d999dd67b-gtkx5`) was stuck `Pending`, repeatedly failing scheduling with "2 Insufficient memory" across both schedulable worker nodes. `model-proxy` canary pods briefly hit the same FailedScheduling condition during a rollout step transition but squeezed into place; embedder's extra pod did not.

## Root cause
The k3d cluster has only two schedulable worker nodes (`k3d-obs-lab-agent-0`, `k3d-obs-lab-agent-1`), each with ~2.1Gi allocatable memory (the third node, `k3d-obs-lab-server-0`, carries a control-plane taint and cannot take general workloads). `embedder`'s Deployment (revision 47, no HPA, argocd tracking-id present but last synced ~15h before onset) was scaled from 1→4 replicas by the deployment controller. That added 3 new 192Mi-request pods on top of existing `gateway`, `retriever`, `model-proxy`, and monitoring DaemonSet memory usage already consuming most of `agent-1`'s headroom. Two of the three new pods scheduled; the fourth (`gtkx5`) could not fit on either worker node, producing the FailedScheduling events matching the alert exactly (onset ~15:02:46 UTC, matching the "Scaled up replica set embedder-7d999dd67b from 1 to 4" event). The `be17fe4e1665` gitops revision deployed to all apps was ruled out as the trigger — it landed ~15 hours before the alert onset with no new sync around the incident window, so this was a transient replica-count spike, not a bad deploy. The underlying capacity issue is that the worker node pool has no memory headroom to absorb even a modest replica increase on `embedder` without a pod going unschedulable.

## What fixed it
By the time investigation completed, the deployment controller had already reverted `embedder` back to 3 desired replicas on its own, and the previously-Pending pod was gone with all remaining pods `Running` and zero new FailedScheduling events for several minutes. A scale_deployment action targeting `embedder` at 3 replicas was dry-run (diff: `spec.replicas: 3 -> 3`, confirming the safe state), approved by the operator, and executed to formally lock in the healthy replica count. alert_status confirmed KubeFailedScheduling cleared (active=false) immediately after.

## Lessons
- No runbook currently matches `KubeFailedScheduling` — this incident should seed one, covering: check `kube_node_status_allocatable` vs `kube_pod_container_resource_requests` per node, identify which workload's replica/requests change tipped scheduling over capacity, and scale back or right-size requests.
- The worker node pool (2 schedulable nodes at ~2.1Gi each) has very little slack for the current set of subject-namespace workloads; any uncoordinated replica bump (manual, chaos-driven, or rollout-driven) can push a node into Insufficient-memory territory. Consider either raising node memory allocatable, tightening/right-sizing per-pod memory requests, or gating replica changes on cluster capacity.
- No HPA exists on `embedder`, and its Deployment has a high revision count (47), suggesting frequent external replica changes outside of gitops — worth confirming what actor is doing this and whether it should be bounded.
