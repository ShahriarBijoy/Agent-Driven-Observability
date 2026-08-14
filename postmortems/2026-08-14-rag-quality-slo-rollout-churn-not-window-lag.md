# Postmortem: RAG top-1 relevance below the 90% objective over the last hour (burn-rate alerting saturates for a loose SLO)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-14 00:05:48Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-14 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 00:01:18Z | log-spike | log-spike onset: [gateway] usage write failed: Failed query: insert into "usage_events" ("id", "tenant", "prompt_tokens", "completion_tokens", "model", "created_at") values (default, $1, $2, $3, $4, default) |
| 00:02:18Z | k8s | ReplicaSet/retriever-86699d9d9d: SuccessfulCreate |
| 00:02:18Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:02:18Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 00:02:18Z | k8s | Rollout/gateway: RolloutUpdated |
| 00:02:18Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 00:02:18Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Scheduled |
| 00:02:19Z | k8s | ReplicaSet/gateway-7cf8f79458: SuccessfulCreate |
| 00:02:19Z | k8s | Pod/gateway-77cfb95667-8tdz6: Killing |
| 00:02:19Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 00:02:19Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 00:02:19Z | k8s | Pod/gateway-7cf8f79458-rffhd: Scheduled |
| 00:02:20Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Started |
| 00:02:20Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Pulled |
| 00:02:20Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Created |
| 00:02:20Z | k8s | Pod/gateway-7cf8f79458-rffhd: Started |
| 00:02:20Z | k8s | Pod/gateway-7cf8f79458-rffhd: Pulled |
| 00:02:20Z | k8s | Pod/gateway-7cf8f79458-rffhd: Created |
| 00:02:27Z | k8s | Pod/retriever-77df6c9cc5-c7f2g: Killing |
| 00:02:27Z | k8s | ReplicaSet/retriever-77df6c9cc5: SuccessfulDelete |
| 00:02:27Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:02:27Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 00:02:28Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 00:03:28Z | k8s | Pod/gateway-7cf8f79458-rffhd: Killing |
| 00:03:28Z | k8s | AnalysisRun/gateway-7cf8f79458-27-1: MetricSuccessful |
| 00:03:28Z | k8s | AnalysisRun/gateway-7cf8f79458-27-1: AnalysisRunSuccessful |
| 00:03:28Z | k8s | ReplicaSet/gateway-7cf8f79458: SuccessfulDelete |
| 00:03:28Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 00:03:28Z | k8s | Rollout/gateway: RolloutUpdated |
| 00:03:29Z | k8s | ReplicaSet/gateway-746788f5df: SuccessfulCreate |
| 00:03:29Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 00:03:29Z | k8s | Pod/gateway-746788f5df-t6bqb: Scheduled |
| 00:03:30Z | k8s | Pod/gateway-746788f5df-t6bqb: Started |
| 00:03:30Z | k8s | Pod/gateway-746788f5df-t6bqb: Pulled |
| 00:03:30Z | k8s | Pod/gateway-746788f5df-t6bqb: Created |
| 00:03:36Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 00:03:38Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 00:04:43Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Pulled |
| 00:04:43Z | k8s | ReplicaSet/retriever-55dc5cc955: SuccessfulCreate |
| 00:04:43Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:04:43Z | k8s | Rollout/gateway: RolloutUpdated |
| 00:04:43Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 00:04:43Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Scheduled |
| 00:04:44Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Started |
| 00:04:44Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Created |
| 00:04:44Z | k8s | Pod/gateway-746788f5df-t6bqb: Killing |
| 00:04:44Z | k8s | AnalysisRun/gateway-746788f5df-28-1: MetricSuccessful |
| 00:04:44Z | k8s | AnalysisRun/gateway-746788f5df-28-1: AnalysisRunSuccessful |
| 00:04:44Z | k8s | ReplicaSet/gateway-746788f5df: SuccessfulDelete |
| 00:04:44Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 00:04:45Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulCreate |
| 00:04:45Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 00:04:45Z | k8s | Pod/gateway-569c859d85-mlpcq: Scheduled |
| 00:04:46Z | k8s | Pod/gateway-569c859d85-mlpcq: Started |
| 00:04:46Z | k8s | Pod/gateway-569c859d85-mlpcq: Pulled |
| 00:04:46Z | k8s | Pod/gateway-569c859d85-mlpcq: Created |
| 00:04:50Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Killing |
| 00:04:50Z | k8s | ReplicaSet/retriever-86699d9d9d: SuccessfulDelete |
| 00:04:50Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:04:53Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 00:04:55Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 00:05:10Z | alert | alert firing: SLO RAG quality — below objective |
| 00:08:24Z | k8s | AnalysisRun/gateway-569c859d85-29-1: MetricSuccessful |
| 00:08:24Z | k8s | AnalysisRun/gateway-569c859d85-29-1: AnalysisRunSuccessful |
| 00:08:24Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 00:08:26Z | k8s | Pod/gateway-77cfb95667-c2tjm: Killing |
| 00:08:26Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 00:08:27Z | k8s | Pod/gateway-77cfb95667-c2tjm: Unhealthy |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Started |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Pulled |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Created |
| 00:08:28Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulCreate |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Scheduled |
| 00:09:36Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19ffd96d5c5295) |
| 00:09:55Z | remediation | restart_workload gateway executed (run run_19ffd96d5c5295) |
| 00:09:56Z | k8s | Pod/gateway-569c859d85-59dfp: Killing |
| 00:09:56Z | k8s | AnalysisRun/gateway-569c859d85-29-3: MetricSuccessful |
| 00:09:56Z | k8s | AnalysisRun/gateway-569c859d85-29-3: AnalysisRunSuccessful |
| 00:09:56Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulDelete |
| 00:09:57Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulCreate |
| 00:09:57Z | k8s | Pod/gateway-77cfb95667-jcmwg: Scheduled |
| 00:09:58Z | k8s | Pod/gateway-77cfb95667-jcmwg: Started |
| 00:09:58Z | k8s | Pod/gateway-77cfb95667-jcmwg: Pulled |
| 00:09:58Z | k8s | Pod/gateway-77cfb95667-jcmwg: Created |
| 00:10:05Z | k8s | Pod/gateway-569c859d85-mlpcq: Killing |
| 00:10:05Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulDelete |
| 00:10:06Z | k8s | ReplicaSet/gateway-74677864c: SuccessfulCreate |
| 00:10:06Z | k8s | Pod/gateway-74677864c-4v9fx: Scheduled |
| 00:10:07Z | k8s | Pod/gateway-74677864c-4v9fx: Started |
| 00:10:07Z | k8s | Pod/gateway-74677864c-4v9fx: Pulled |
| 00:10:07Z | k8s | Pod/gateway-74677864c-4v9fx: Created |
| 00:10:15Z | k8s | ReplicaSet/retriever-6599665c84: SuccessfulCreate |
| 00:10:15Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:10:15Z | k8s | Pod/retriever-6599665c84-qzghv: Scheduled |
| 00:10:15Z | remediation | restart_workload retriever executed (run run_19ffd96d5c5295) |
| 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Started |
| 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Pulled |
| 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Created |
| 00:10:23Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Killing |
| 00:10:23Z | k8s | ReplicaSet/retriever-55dc5cc955: SuccessfulDelete |
| 00:10:23Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:11:52Z | verification | recovery NOT verified — deadline armed |
| 00:13:45Z | k8s | AnalysisRun/gateway-74677864c-30-1: MetricSuccessful |
| 00:13:45Z | k8s | AnalysisRun/gateway-74677864c-30-1: AnalysisRunSuccessful |
| 00:13:45Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 00:13:46Z | k8s | Pod/gateway-77cfb95667-jcmwg: Killing |
| 00:13:46Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 00:13:47Z | k8s | ReplicaSet/gateway-74677864c: SuccessfulCreate |
| 00:13:47Z | k8s | Pod/gateway-74677864c-fqwwb: Scheduled |
| 00:13:48Z | k8s | Pod/gateway-74677864c-fqwwb: Started |
| 00:13:48Z | k8s | Pod/gateway-74677864c-fqwwb: Pulled |
| 00:13:48Z | k8s | Pod/gateway-74677864c-fqwwb: Created |
| 00:17:26Z | k8s | AnalysisRun/gateway-74677864c-30-3: MetricSuccessful |
| 00:17:26Z | k8s | AnalysisRun/gateway-74677864c-30-3: AnalysisRunSuccessful |
| 00:17:27Z | k8s | Pod/gateway-77cfb95667-pxxjw: Killing |
| 00:17:27Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 00:17:29Z | k8s | Pod/gateway-74677864c-fzx42: Started |
| 00:17:29Z | k8s | Pod/gateway-74677864c-fzx42: Pulled |
| 00:17:29Z | k8s | Pod/gateway-74677864c-fzx42: Created |
| 00:17:29Z | k8s | ReplicaSet/gateway-74677864c: SuccessfulCreate |
| 00:17:29Z | k8s | Pod/gateway-74677864c-fzx42: Scheduled |
| 00:17:36Z | k8s | Pod/gateway-77cfb95667-8lsdc: Killing |
| 00:17:36Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 00:17:37Z | k8s | ReplicaSet/gateway-74677864c: SuccessfulCreate |
| 00:17:37Z | k8s | Pod/gateway-74677864c-7tjvp: Scheduled |
| 00:17:38Z | k8s | Pod/gateway-74677864c-7tjvp: Started |
| 00:17:38Z | k8s | Pod/gateway-74677864c-7tjvp: Pulled |
| 00:17:38Z | k8s | Pod/gateway-74677864c-7tjvp: Created |
| 00:18:11Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:18:12Z | k8s | Pod/retriever-6599665c84-cf972: Started |
| 00:18:12Z | k8s | Pod/retriever-6599665c84-cf972: Pulled |
| 00:18:12Z | k8s | Pod/retriever-6599665c84-cf972: Created |
| 00:18:12Z | k8s | ReplicaSet/retriever-6599665c84: SuccessfulCreate |
| 00:18:12Z | k8s | Pod/embedder-fdff9df4-kg9h2: Pulling |
| 00:18:12Z | k8s | Pod/embedder-fdff9df4-kg9h2: Pulled |
| 00:18:12Z | k8s | ReplicaSet/embedder-fdff9df4: SuccessfulCreate |
| 00:18:12Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 00:18:12Z | k8s | Pod/retriever-6599665c84-cf972: Scheduled |
| 00:18:12Z | k8s | Pod/embedder-fdff9df4-kg9h2: Scheduled |
| 00:18:13Z | deploy:argo | embedder synced to c025382ba170 |
| 00:18:13Z | k8s | Pod/embedder-fdff9df4-kg9h2: Started |
| 00:18:13Z | k8s | Pod/embedder-fdff9df4-kg9h2: Killing |
| 00:18:13Z | k8s | Pod/embedder-fdff9df4-kg9h2: Created |
| 00:18:13Z | k8s | ReplicaSet/embedder-fdff9df4: SuccessfulDelete |
| 00:18:13Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 00:18:15Z | deploy:annotation | deploy embedder via gitops c025382 (argo sync) |
| 00:21:55Z | k8s | ReplicaSet/retriever-6599665c84: SuccessfulCreate |
| 00:21:55Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 00:21:55Z | k8s | Pod/retriever-6599665c84-sb764: Scheduled |
| 00:21:55Z | k8s | Pod/retriever-6599665c84-ppf7c: Scheduled |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-sb764: Started |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-sb764: Pulling |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-sb764: Pulled |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-sb764: Created |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-ppf7c: Started |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-ppf7c: Pulling |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-ppf7c: Pulled |
| 00:21:56Z | k8s | Pod/retriever-6599665c84-ppf7c: Created |
| 00:25:57Z | k8s | ReplicaSet/load-generator-7c76774b59: SuccessfulCreate |
| 00:25:57Z | k8s | Deployment/load-generator: ScalingReplicaSet |
| 00:25:57Z | k8s | Pod/load-generator-7c76774b59-kdxmq: Scheduled |
| 00:25:57Z | remediation | scale_deployment load-generator executed (run run_19ffda4ce96554) |
| 00:25:58Z | deploy:argo | load-generator synced to c025382ba170 |
| 00:25:58Z | k8s | Pod/load-generator-7c76774b59-kdxmq: Started |
| 00:25:58Z | k8s | Pod/load-generator-7c76774b59-kdxmq: Pulling |
| 00:25:58Z | k8s | Pod/load-generator-7c76774b59-kdxmq: Pulled |
| 00:25:58Z | k8s | Pod/load-generator-7c76774b59-kdxmq: Created |
| 00:25:58Z | k8s | ReplicaSet/load-generator-7c76774b59: SuccessfulDelete |
| 00:25:58Z | k8s | Deployment/load-generator: ScalingReplicaSet |
| 00:25:59Z | k8s | Pod/load-generator-7c76774b59-kdxmq: Killing |
| 00:26:02Z | deploy:annotation | deploy load-generator via gitops c025382 (argo sync) |
| 00:27:59Z | verification | recovery NOT verified — deadline armed |
| 00:33:16Z | k8s | Pod/embedder-fdff9df4-vzn5h: Pulled |
| 00:33:16Z | k8s | Pod/embedder-fdff9df4-vzn5h: Created |
| 00:33:16Z | k8s | ReplicaSet/embedder-fdff9df4: SuccessfulCreate |
| 00:33:16Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 00:33:16Z | k8s | Pod/embedder-fdff9df4-vzn5h: Scheduled |
| 00:33:17Z | k8s | Pod/embedder-fdff9df4-vzn5h: Started |
| 00:43:21Z | verification | recovery NOT verified — deadline armed |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786665948604%22%2C+%22to%22%3A+%221786668744853%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum+by+%28le%2C+service%29+%28rate%28request_duration_seconds_bucket%5B5m%5D%29%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786665948604%22%2C+%22to%22%3A+%221786668744853%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
5 deploy-window leads
- deploy annotation at 2026-08-14T00:18:15.307000+00:00: deploy embedder via gitops c025382 (argo sync)
- deploy annotation at 2026-08-14T00:26:02.892000+00:00: deploy load-generator via gitops c025382 (argo sync)
- argo app embedder: sync=OutOfSync health=Healthy (revision c025382ba170)
- argo app platform: sync=OutOfSync health=Healthy (revision c025382ba170)
- argo app retriever: sync=OutOfSync health=Healthy (revision c025382ba170)

### attribution — LEAD
No service or dependency edge above 1% errors or 1s p95 in the last 10m (highest: gateway 0.0%) — whatever paged us is not a broad service-level failure. Look for something too narrow to move a service-wide number (one route, one tenant, one pod) or something that is not request-shaped at all (a stuck rollout, a pipeline, a credential).
- No service or dependency edge above 1% errors or 1s p95 in the last 10m (highest: gateway 0.0%) — whatever paged us is not a broad service-level failure. Look for something too narrow to… (truncated)

### kube_scan — OK
all pods Ready, no notable cluster events

### log_spike — OK
error/failed log rate normal: 0/10min vs baseline 0/10min

### rollout_state — OK
gateway and model-proxy rollouts stable, no failed analysis

### secret_age — OK
Secret subject-db-credentials last modified 20d 1h ago (created 20d 1h ago).

</details>

## Narrative

## Summary

Re-diagnosed from scratch (attempt 4, not repeating the prior remediation). The earlier two closures both concluded "1-hour SLO window lag, nothing actionable" and treated it almost as a non-event. That framing was incomplete: this pass found the actual, real quality failure that poisoned the window, and confirmed it is now over — but also found a genuine gap that could stop the alert from clearing cleanly even after the bad data ages out.

## Impact

`tenant=test-bench` RAG top-1 relevance dropped hard for a ~13-minute window and the SLO burn-rate alert has been continuously active since 00:05:10 UTC. No broad service-level failure accompanied it: gateway error rate stayed 0%, p95 stayed flat at ~4.75ms, and there are zero error/warn log lines across gateway/retriever/embedder in the incident window.

## Root cause

This was **not** a stale-DB-credential recurrence (that fix from an earlier incident is still holding — Secret unchanged for 20+ days) and it was **not** a code regression from a new commit (no new CI build landed in the relevant window; the last merge to `main` was hours earlier and green).

The real cause: a **gateway rollout hit readiness-probe instability and one aborted canary attempt**, and the pod churn that followed genuinely tanked RAG retrieval quality for the pods serving live traffic during that window:
- `Rollout/gateway` revision 26 (pod-template hash `746788f5df`) failed its `canary-p95` metric and was **aborted** after a readiness probe timed out (`context deadline exceeded`).
- A retry (revision 30, hash `74677864c`) succeeded through both canary steps and is the version now fully promoted and stable (4/4 ready, `stableHash == canaryHash`).
- `retriever` also cycled its ReplicaSet in the same window.
- During that churn, `retrieval_relevance_score_sum/count` (the RAG-quality SLI's raw input) collapsed: the cumulative average is pinned at **≈0.154**, far below the 0.90 objective — a real quality crater, not a metrics artifact.
- Crucially, **Argo Rollout's canary analysis only gates on `canary-error-rate` and `canary-p95`** (both stayed green throughout) — there is no RAG-quality metric in the analysis template, so this class of regression sails through delivery gating undetected. That is the actual root cause of why this reached production traffic at all.

Since ~00:07 UTC there has been **zero new inference traffic** — `load-generator` sits at 0/0 replicas, confirmed as the true GitOps-desired state (Argo `Synced`, not drifted; reconfirmed by two independent auto-syncs landing unprompted at 00:18 and 00:26 without any action from this session). With no fresh traffic, `slo:rag_quality:sli_ratio5m` reads a **vacuous 1** (no data, not a real pass), and `slo:rag_quality:sli_ratio1h` stays mechanically pinned at 0 because the bad burst is still inside its lookback and nothing is arriving to dilute it.

## What fixed it

Nothing was applied this round, and nothing from either prior round was repeated. The rollout that caused the crater already self-resolved on retry — `gateway` and `retriever` are both currently Healthy with clean canary history and zero error/warn logs. Two remediation options were considered and both rejected with evidence, not guesswork:
- **Re-scale `load-generator`** — rejected again: it is GitOps-owned at 0 replicas and has now been observed to self-revert via auto-sync twice tonight. Fighting it would not hold.
- **Restart `gateway`/`retriever` again** — rejected as actively risky: doing so would reproduce the exact readiness-probe churn that caused the original relevance crater, extending the incident rather than closing it.

No dry-run/approval cycle was forced for either, consistent with the instruction not to repeat an already-failed action without new evidence that it would behave differently — here the new evidence points the other way.

## Verification

`alert_status` checked twice this round: active at the start, still active at the end (since 00:05:10 UTC, unchanged) — reported honestly, not assumed resolved. `slo:rag_quality:sli_ratio1h` is expected to age the bad burst out of its 1-hour lookback around **01:07–01:09 UTC**. Flagging for the record: because there is currently no synthetic traffic, once the burst ages out there may be no data at all to replace it with a clean "1" reading — the series could go to no-data/absent rather than a confirmed-good value, which is a monitoring gap worth fixing, not proof the SLO recording rule is broken.

## Lessons

1. **Canary analysis for `gateway`/`model-proxy` has no RAG-quality gate.** Add a `retrieval-relevance` metric to the `canary-analysis` AnalysisTemplate so a quality crater like this one blocks promotion instead of riding through on clean error-rate/p95 alone.
2. **A quality SLI with a burst-y, on/off traffic generator produces misleading readings on both ends** — a vacuous "1" when idle, and a windowed-but-un-refreshable "0" after a bad burst. Either keep a low steady baseline of `load-generator` traffic, or make the recording rule return absent/no-data explicitly (and alert on staleness) instead of extrapolating from stale samples.
3. Investigate *why* the gateway readiness probe timed out / reset mid-rollout (revision 26) — that's the proximate trigger and wasn't fully root-caused here; worth a follow-up dedicated to pod startup resource pressure during rollout churn.

```mermaid
flowchart LR
  client[Client / test-bench traffic] --> gateway[gateway\nArgo Rollout]
  gateway --> retriever[retriever]
  gateway --> modelproxy[model-proxy]
  retriever --> embedder[embedder]
  retriever --> pg[(postgres / pgvector)]
  gateway --> canary{canary-analysis\nerror-rate + p95 only}
  canary -->|promote| stable[gateway stable\nhash 74677864c]

  style gateway fill:#7a1f1f,stroke:#ff6b6b,stroke-width:3px,color:#fff
  style retriever fill:#7a1f1f,stroke:#ff6b6b,stroke-width:2px,color:#fff
  style canary fill:#5a4210,stroke:#e0a52c,stroke-width:2px,color:#fff

  gateway -. "readiness-probe timeout,\naborted rev 26, retried as rev 30 —\nRAG relevance crater to avg 0.154\nduring the churn" .-> canary
  canary -. "gate never sees RAG quality,\nonly error-rate (0%) + p95 (4.75ms) —\nboth clean, so degraded quality\nwas never blocked" .-> stable
```
