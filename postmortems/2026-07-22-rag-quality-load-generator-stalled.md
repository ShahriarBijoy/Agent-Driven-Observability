# Postmortem: RAG top-1 relevance below the 90% objective over the last hour (burn-rate alerting saturates for a loose SLO)

- **Status:** resolved
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-22 19:46:48Z
- **Resolved:** 2026-07-22 20:46:48Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 19:33:01Z | deploy:ci | CI run #17 success on postmortem/inc_19f8b4932351: obs: postmortem: gateway-5xx-storm-self-recovered |
| 19:41:14Z | log-spike | log-spike onset:       at ErrorResponse (/app/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/connection.js:817:22) |
| 19:41:16Z | deploy:ci | CI run #18 success on postmortem/inc_19f8b55bdfc3a: obs: postmortem: retriever-lineage-emit-stall |
| 19:46:10Z | alert | alert firing: SLO RAG quality — below objective |
| 19:47:30Z | verification | recovery NOT verified — deadline armed |
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
| 20:00:09Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8b681184318) |
| 20:02:01Z | remediation | restart_workload retriever executed (run run_19f8b681184318) |
| 20:02:02Z | k8s | Pod/retriever-646d994555-86nqp: Pulled |
| 20:02:02Z | k8s | ReplicaSet/retriever-646d994555: SuccessfulCreate |
| 20:02:02Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 20:02:02Z | k8s | Rollout/gateway: RolloutUpdated |
| 20:02:02Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 20:02:02Z | k8s | Pod/retriever-646d994555-86nqp: Scheduled |
| 20:02:02Z | remediation | restart_workload gateway executed (run run_19f8b681184318) |
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
| 20:02:18Z | verification | recovery NOT verified — deadline armed |
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
| 20:06:14Z | k8s | ReplicaSet/retriever-646d994555: SuccessfulCreate |
| 20:06:14Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 20:06:14Z | k8s | Pod/retriever-646d994555-ssbp9: Scheduled |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Started |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Pulling |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Pulled |
| 20:06:15Z | k8s | Pod/retriever-646d994555-ssbp9: Created |
| 20:07:37Z | deploy:ci | CI run #19 success on postmortem/inc_19f8b69a4b0331: obs: postmortem: retriever-single-replica-cascade-slo-burn |
| 20:09:25Z | k8s | AnalysisRun/gateway-659b5cb47d-17-3: MetricSuccessful |
| 20:09:25Z | k8s | AnalysisRun/gateway-659b5cb47d-17-3: AnalysisRunSuccessful |
| 20:09:25Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 20:09:26Z | k8s | Pod/gateway-7c59c74c58-n5xjz: Killing |
| 20:09:26Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulDelete |
| 20:09:27Z | k8s | Pod/gateway-659b5cb47d-466qv: Pulled |
| 20:09:27Z | k8s | ReplicaSet/gateway-659b5cb47d: SuccessfulCreate |
| 20:09:27Z | k8s | Pod/gateway-659b5cb47d-466qv: Scheduled |
| 20:09:28Z | k8s | Pod/gateway-659b5cb47d-466qv: Started |
| 20:09:28Z | k8s | Pod/gateway-659b5cb47d-466qv: Created |
| 20:09:35Z | k8s | Pod/gateway-7c59c74c58-vwmwd: Killing |
| 20:09:35Z | k8s | ReplicaSet/gateway-7c59c74c58: SuccessfulDelete |
| 20:09:35Z | k8s | ReplicaSet/gateway-659b5cb47d: SuccessfulCreate |
| 20:09:35Z | k8s | Pod/gateway-659b5cb47d-6sj7b: Scheduled |
| 20:09:36Z | k8s | Pod/gateway-659b5cb47d-6sj7b: Started |
| 20:09:36Z | k8s | Pod/gateway-659b5cb47d-6sj7b: Pulled |
| 20:09:36Z | k8s | Pod/gateway-659b5cb47d-6sj7b: Created |
| 20:13:05Z | verification | recovery NOT verified — deadline armed |
| 20:20:10Z | deploy:ci | CI run #20 success on phase-11: obs: p11: contracts AgentKind gains oncall - web client was rejecting every oncall payload |
| 20:42:10Z | alert | alert resolved: SLO RAG quality — below objective |
| 22:00:28Z | remediation | scale_deployment load-generator executed (run run_19f8b7ef7dc4a7) |
| 22:00:29Z | k8s | ReplicaSet/load-generator-5fc6b58d76: SuccessfulCreate |
| 22:00:29Z | k8s | Deployment/load-generator: ScalingReplicaSet |
| 22:00:29Z | k8s | Pod/load-generator-5fc6b58d76-xlndx: Scheduled |
| 22:00:30Z | k8s | Pod/load-generator-5fc6b58d76-xlndx: Started |
| 22:00:30Z | k8s | Pod/load-generator-5fc6b58d76-xlndx: Pulling |
| 22:00:30Z | k8s | Pod/load-generator-5fc6b58d76-xlndx: Pulled |
| 22:00:30Z | k8s | Pod/load-generator-5fc6b58d76-xlndx: Created |
| 22:00:56Z | deploy:ci | CI run #21 in_progress on phase-11: obs: p11: oxfmt markdown + teach runbook parser oxfmt's multi-line flow lists

CI Lint & format failed on 4 phase-11 mar |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784749608626%22%2C+%22to%22%3A+%221784753208400%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784749608626%22%2C+%22to%22%3A+%221784753208400%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
The "SLO RAG quality — below objective" (sev2, tenant acme) alert fired because top‑1 retrieval relevance was measured well under the 90% objective. No runbook is currently matched to this alertname; investigation was done from telemetry alone. This was attempt 3 on this incident — the two prior remediation attempts had not restored service.

## Impact
RAG relevance SLO in breach; simultaneously, no fresh `inferences` rows were landing for any tenant (acme/bravo/abuser), tripping `dq_violations` freshness (~48min stale) and low_volume (0/min vs baseline) checks. Argo's `platform` app also had a failed sync operation (retried 5x, 19:38:51–19:49:10) overlapping the alert window, and `retriever`/`platform` remained OutOfSync at revision `b30568f102cd`.

## Root cause
Two distinct things were tangled together:

1. **Proximate/actionable cause**: `deployment/load-generator` was found scaled to **0/0 replicas** (confirmed live via dry-run: `spec.replicas: 0 -> 1`), almost certainly left that way by an earlier remediation attempt in this same incident. With no load-generator traffic, no new inferences were being written, freezing the `retrieval_relevance_score` gateway histogram and the DQ freshness/volume signals — this alone was enough to keep the burn-rate alert latched.
2. **Chronic background signal (not the trigger, but worth flagging)**: `retrieval_score_mean`/`retrieval_relevance_score` has averaged ~0.15 across *every* tenant and *every* hour of recorded history back to 2026‑07‑19 (system inception), with ~98% of samples ≤0.2. This long-window low baseline is why the "loose SLO" burn-rate alert (per its own summary) eventually saturated — but it predates today's deploys and did not move with the last gitops sync (`b30568f102cd`, 12:26 UTC, retriever image unchanged), so a bad recent deploy was ruled out as the trigger. A brief, self-resolved `retriever` crash (`unhandled error` in `queryWithCache`, one pod, ~19:41 UTC) was also observed but retriever has run with 0 restarts and normal (~75MB/512Mi) memory since ~20:01 UTC, so it isn't the ongoing cause either.

Given two prior attempts had already tried restart/scale-style fixes on `retriever` without success (evidenced by heavy ReplicaSet churn — dozens of revisions — with no effect), repeating that same class of fix was ruled out; the new evidence (0-replica load-generator, healthy retriever, flat historical baseline) pointed at the traffic stall instead.

## What fixed it
Scaled `deployment/load-generator` back from 0 to 1 replica (dry-run verified diff, operator-approved, executed). `alert_status` reported the alert inactive on three consecutive re-checks immediately after.

## Lessons
- No runbook exists yet for `SLO RAG quality — below objective`; one should be authored covering: check `load-generator`/traffic-source replica count first (a stalled generator can itself latch a burn-rate alert), then check the `retrieval_relevance_score` histogram's long-run baseline before assuming a fresh regression.
- The chronic ~15% relevance baseline is suspicious on its own (nearly every sample clusters ≤0.2) and independent of this incident's resolution — worth a follow-up: verify the demo corpus (Pride and Prejudice chunks) is actually a reasonable match for `load-generator`'s synthetic queries, and whether the SLO's 90% objective is realistic for this pipeline as configured.
- The `platform` Argo app has a failing sync (retried 5x) at revision `b30568f102cd` that never resolved — worth separate follow-up since repeated OutOfSync/failed-sync states make it harder to trust "what's actually deployed" during future incidents.
- Confirm any scale-down performed mid-incident gets reverted before closing — this is the second time in this session a remediation attempt's own side effect (a deployment left at 0 replicas) became the lingering blocker.
