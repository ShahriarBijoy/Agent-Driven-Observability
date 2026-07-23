# Postmortem: subject/load-generator available replicas != spec for 2 minutes

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-23 15:30:51Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:00:37Z | deploy:ci | CI run #59 success on postmortem/inc_19f8f7bc0dbcc: obs: postmortem: model-proxy-canary-stall-dq-violation |
| 15:01:16Z | deploy:ci | CI run #60 success on postmortem/inc_19f8f79a3ad5c: obs: postmortem: retriever-single-replica-latency |
| 15:01:54Z | deploy:ci | CI run #61 success on postmortem/inc_19f8f77c9a81d: obs: postmortem: model-proxy-upstream-timeout-5xx |
| 15:03:23Z | deploy:ci | CI run #62 success on postmortem/inc_19f8f7c7371105: obs: postmortem: embedder-single-replica-latency-burn |
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
| 15:14:26Z | deploy:ci | CI run #67 success on postmortem/inc_19f8f8818f947d: obs: postmortem: model-proxy-canary-stuck-healthy-promote |
| 15:17:14Z | deploy:ci | CI run #68 success on web/agents-live-ui: obs: web: frame-panel layouts, oncall incident detail sections, runbook frontmatter metadata |
| 15:27:49Z | k8s | ReplicaSet/load-generator-9c7ddf9bc: SuccessfulCreate |
| 15:27:49Z | k8s | Deployment/load-generator: ScalingReplicaSet |
| 15:27:49Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: FailedScheduling |
| 15:30:20Z | alert | alert firing: KubeDeploymentReplicasMismatch |
| 15:33:11Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: FailedScheduling |
| 15:33:21Z | remediation | scale_deployment retriever executed (run run_19f8f99d51b691) |
| 15:33:23Z | k8s | Pod/retriever-8665c87798-xvhz7: Killing |
| 15:33:23Z | k8s | ReplicaSet/retriever-8665c87798: SuccessfulDelete |
| 15:33:23Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:33:24Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Started |
| 15:33:24Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Pulling |
| 15:33:24Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Pulled |
| 15:33:24Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Created |
| 15:33:24Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Scheduled |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784820651282%22%2C+%22to%22%3A+%221784820881992%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784820651282%22%2C+%22to%22%3A+%221784820881992%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
KubeDeploymentReplicasMismatch fired for `subject/load-generator`: available replicas (0) stayed below spec (1) for over 2 minutes. Root cause was cluster-wide worker-node memory saturation, not a bad load-generator deploy.

## Impact
The load-generator deployment had zero available replicas; its single pod sat `Pending`, unable to be scheduled anywhere in the cluster. No user-facing subject traffic was affected (load-generator is a synthetic traffic driver), but synthetic load generation was paused for the duration.

## Root cause
The k3d cluster has 3 nodes: `k3d-obs-lab-server-0` (control plane, ~7.75Gi allocatable, tainted `CriticalAddonsOnly:NoSchedule`) and two workers, `k3d-obs-lab-agent-0` and `k3d-obs-lab-agent-1` (~2.05Gi allocatable each). Two prior, unrelated incident remediations earlier in the window had scaled up subject workloads on those same two worker nodes: `retriever` went from 1→4 replicas (192Mi request each) and `embedder` net increased from 1→3 replicas (192Mi request each). Combined with existing gateway/model-proxy/postgres/redis pods, this left the two worker nodes at ~99.5%+ of allocatable memory committed (only ~10-28Mi free each) — well below the load-generator pod's 128Mi memory request. The scheduler logged `FailedScheduling: 0/3 nodes are available: 1 node(s) had untolerated taint(s), 2 Insufficient memory` repeatedly. `deploy_history` and `gitea_compare` showed no recent load-generator-specific code or gitops change, and the Argo Application for load-generator was `Healthy`-syncing at the current revision — ruling out a bad deploy of load-generator itself. The proximate cause was capacity contention from sibling workloads' earlier scale-ups, not any change to load-generator.

## What fixed it
Scaled `retriever` back from 4 to 3 replicas (still 3x its original baseline, and CPU/memory utilization per pod was trivial — ~15-20m CPU, ~80Mi/512Mi memory), freeing ~192Mi on the constrained worker node. The load-generator pod was then scheduled onto `k3d-obs-lab-agent-1`, pulled its image, started, and reached `1/1 Ready`. `kube_deployment_status_replicas_available` for load-generator flipped from 0 to 1 and the alert cleared on the next evaluation cycle.

## Lessons
- The two k3d worker nodes have very little memory headroom (~2Gi allocatable each) relative to the aggregate requests of subject workloads; scale-up remediations for one service's incident can starve scheduling for another service shortly after.
- No runbook currently matches `KubeDeploymentReplicasMismatch` — worth authoring one that starts with `k8s_events`/`kubectl describe pod` for `FailedScheduling` reasons, then checks node-level `kube_node_status_allocatable` vs `kube_pod_container_resource_requests` before assuming a bad deploy.
- Consider either raising worker node memory/adding a node, or tightening default memory requests for embedder/retriever, so successive incident-driven scale-ups don't cumulatively exhaust two small nodes.
- The `server-0` control-plane node has ample free memory but is intentionally tainted for critical addons only — not a valid scheduling target for subject workloads without adding a toleration (not recommended).
