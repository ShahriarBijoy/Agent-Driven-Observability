# Postmortem: RAG top-1 relevance below the 90% objective over the last hour (burn-rate alerting saturates for a loose SLO)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-23 15:03:48Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:00:37Z | deploy:ci | CI run #59 success on postmortem/inc_19f8f7bc0dbcc: obs: postmortem: model-proxy-canary-stall-dq-violation |
| 15:01:16Z | deploy:ci | CI run #60 success on postmortem/inc_19f8f79a3ad5c: obs: postmortem: retriever-single-replica-latency |
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
| 15:03:10Z | alert | alert firing: SLO RAG quality — below objective |
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
| 15:11:22Z | deploy:ci | CI run #65 waiting on postmortem/inc_19f8f83e0ed32e: obs: postmortem: embedder-scale-insufficient-memory-scheduling |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819028607%22%2C+%22to%22%3A+%221784819522306%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784819028607%22%2C+%22to%22%3A+%221784819522306%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
SLO alert "RAG quality — below objective" fired for tenant acme (top‑1 retrieval relevance below the 90% objective, burn-rate window). Investigation found this is not a transient regression: retrieval relevance has never met the objective at any point in the recorded history of this environment.

## Impact
Tenant-facing RAG answers have been served with near-zero retrieval relevance the entire time the SLO has existed — every measured hour, across 47 embedder revisions and 74 retriever revisions, top-1 relevance sat at ~0.15–0.16 (0 of 13,053 sampled gateway requests ever scored above 0.3, well under the 0.9 objective). The alert only fired now because it's a loose, slow-saturating multi-window burn-rate SLO that takes sustained failure to cross threshold — this is the first time the long window finally saturated, not the first time quality was bad.

## Root cause
A structural, application/data-layer defect, not an infra incident:
- The indexed corpus (`chunks` table) contains a single seeded document (991 chunks, one `doc_id`, a Pride & Prejudice excerpt) that has not been refreshed since it was first seeded, and is very likely mismatched against whatever topics the live/synthetic query traffic asks about.
- `retrieval_relevance_score` (gateway histogram) and `retrieval_score_mean` (Postgres `inferences`) are flat at ~0.153–0.154 across every observed traffic window from the earliest available data point onward, invariant to: the `be17fe4e1665` gitops deploy, dozens of intervening embedder/retriever rollouts, and two manual pod restarts of embedder and retriever (score identical immediately before and after each restart).
- Ruled out as causes (evidence-backed, not assumption): the `be17fe4e1665` gateway/model-proxy deploy (rollouts currently healthy/progressing, no correlated score change); a stale gateway AnalysisRun error against a Tailscale-routed Prometheus endpoint (dated ~15h prior, already resolved, unrelated metric); embedder pods currently Pending on insufficient node memory (real, but only ~2 minutes old at alert time — postdates days of identical bad scores, so not causal); load-generator at 0 replicas / low_volume dq_violation (Argo reports this as the gitops-declared Synced+Healthy state, and the matched dq-freshness-stall runbook explicitly treats "source intentionally stopped" as not an incident — also irrelevant to relevance scoring, which is flat regardless of traffic volume).

## What fixed it
Nothing was remediated via the on-call toolkit, and nothing should have been attempted blindly. None of the available actions (scale, restart, rollback, memory-limit patch, rollout abort/promote, secret sync) touch retrieval scoring logic or corpus content, and direct evidence (two independent restarts with zero effect on the score) already rules out "restart fixes it." Dry-running an infra action here would have been an unsupported guess against explicit evidence, so none was executed. Alert remains active — this requires an application/data-layer fix, not an infra remediation, and is reported here as an explicit non-recovery.

## Lessons
- This alert has no matching runbook. One should be authored covering: (1) always check whether `retrieval_relevance_score`/`retrieval_score_mean` has ever met objective historically before assuming a recent-deploy regression — a flat, deploy-invariant series is the tell for a structural/data defect rather than an incident; (2) point at the `chunks` corpus freshness/coverage vs. query topic distribution as the first data-layer thing to check; (3) explicitly note that this SLO's burn-rate is loose enough that "alert just fired" does not mean "problem just started."
- Follow-up needed outside this on-call session: refresh/expand the seed corpus to match the live query distribution, or audit the retriever/embedder similarity computation for a calibration bug, and reassess whether the 90% objective is realistic for the current mock-embedder pipeline.
- The concurrent embedder scheduling pressure (2/4 pods Pending, insufficient node memory) and the load-generator-at-zero state are both real but separate conditions worth their own tickets; neither is the driver of this SLO breach.
