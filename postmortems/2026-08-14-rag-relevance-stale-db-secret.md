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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786665948604%22%2C+%22to%22%3A+%221786666302431%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum+by+%28le%2C+service%29+%28rate%28request_duration_seconds_bucket%5B5m%5D%29%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786665948604%22%2C+%22to%22%3A+%221786666302431%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
2 deploy-window leads
- argo app gateway: sync=Synced health=Progressing (revision c025382ba170)
- argo app platform: sync=OutOfSync health=Healthy (revision c025382ba170)

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: [gateway] usage write failed: Failed query: insert into "usage_events" ("id", "tenant", "prompt_tokens", "completion_tokens", "model", "created_at") values (default, $1, $2, $3, $4, default) at 2026-08-14T00:01:18.822810+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: [gateway] usage write failed: Failed query: insert into "usage_events" ("id", "tenant", "prompt_tokens", "comp… (truncated)

### attribution — LEAD
errors concentrate on gateway → POST retriever (43.4%); time concentrates in gateway's own handler (~5.3s of 9.1s) over the last 10m — which is not necessarily the workload named on the alert:
- retriever: 42.4% of its OWN responses are 5xx (10m)
- gateway: 40.2% of its OWN responses are 5xx (10m)
- model-proxy: 2.6% of its OWN responses are 5xx (10m)
- gateway → POST retriever: 43.4% of those outbound calls failed
- gateway → POST model-proxy: 13.2% of those outbound calls failed
- own-handler p95 (server p95 minus its slowest outbound call — a ranking, not a measurement): gateway ~5.3s of 9.1s end to end, embedder ~3.8s of 3.8s end to end, retriever ~3.8s of 3.8s end to end
- gateway → POST embedder: p95 3.8s outbound
- gateway → POST retriever: p95 3.8s outbound
-
… (section truncated)

### rollout_state — LEAD
1 rollout-state lead
- rollout gateway: Progressing — more replicas need to be updated (step 1/4)

### kube_scan — OK
all pods Ready, no notable cluster events

### secret_age — OK
Secret subject-db-credentials last modified 20d 0h ago (created 20d 0h ago).

</details>

## Narrative

## Summary

The `SLO RAG quality — below objective` burn-rate alert fired because top-1 retrieval relevance collapsed to near-zero across almost all `test-bench` traffic. Root cause was a stale database credential: Postgres had a rotated password for user `lab` in the vault, but `secret/subject-db-credentials` in the cluster still held the old value, so every retriever query for chunks/embeddings — and every gateway usage-event write — was rejected outright.

## Impact

Nearly all RAG requests during the incident window returned degraded or empty retrieved context: the gateway's `retrieval_relevance_score` histogram showed only ~1.5–2.2% of scores exceeding even a 0.2 floor (see `report.html`), far below the 90% top-1 relevance objective. Gateway `usage_events` inserts also failed continuously (the log-spike pre-check lead), and readiness-probe timeouts plus the resulting churn kept the gateway Argo Rollout stuck retrying canary steps (never a code issue — the deployed image tag `10f24bc` never changed across the churn).

## Root cause

`Postgres` rejected the `lab` user with `FATAL: password authentication failed for user "lab"` for every connection attempt from both `retriever` (chunk/embedding lookups feeding relevance scoring) and `gateway` (usage_events writes). This is the classic stale-secret failure mode: the vault-side password was rotated but `secret/subject-db-credentials` was never updated to match, so pods old and new alike presented the stale credential. The pre-check's `secret_age` lead reported "OK" only because it reads the Secret **object's** own last-modified timestamp (20d, unchanged) — that field never moves when only the vault-side value rotates, which is exactly this bug's blind spot, not evidence the secret was fine. `deploy_history`/`argo_app` confirmed no code deploy landed in the window (image sha unchanged throughout), ruling out a bad-deploy explanation and pointing squarely at credential drift; the retriever's separately-logged "lineage emit failed / operation timed out" warnings (Marquez-over-Tailscale) are a known pre-existing, always-on decoy per prior incident history and were not implicated.

## What fixed it

1. `update_db_secret` (dry-run reviewed, approved, executed) synced `secret/subject-db-credentials` to the rotated vault password.
2. `restart_workload` (dry-run reviewed, approved, executed) rolling-restarted `gateway` and then `retriever`, in that order, so running pods picked up the refreshed credential — restarting before the secret sync would have just reproduced the same failure against fresh pods.
3. Verification: a fresh `loki_query` for `"password authentication failed"` over the 5 minutes following the restarts returned zero hits, and `kubectl get pods` showed the new gateway/retriever replicas healthy. The SLO alert itself had not yet cleared in Alertmanager as of the final check — expected, since this is a burn-rate alert over an hour-long window and the alert's own annotation notes it "saturates for a loose SLO," so recovery will lag the fix by a full evaluation cycle; closure is decided server-side after this session.

## Lessons

- The `secret_age` pre-check needs a second signal (e.g. correlating the first `password authentication failed` log line against Secret mtime, as the runbook's diagnose step recommends) rather than trusting Secret mtime alone — a vault-side rotation that never touches the k8s Secret object will always read as "OK" today.
- Consider a synthetic canary check on Postgres auth (or DB errors) feeding directly into the gateway's canary analysis template — the Argo Rollout's `canary-error-rate`/`canary-p95` metrics stayed green (error-rate 0, p95 ~4.75ms) throughout this incident because they don't exercise the DB-backed retrieval path, so the rollout kept auto-retrying a canary that could never have fixed a credential problem.
- `pg_select` against the `inferences` table is stale/decoy data in this environment (last row 2026-07-23, pre-tenant-rename tenant names) — do not use it to gauge live RAG quality; rely on the gateway's `retrieval_relevance_score`/`retrieval_top_score` Mimir metrics instead.

```mermaid
flowchart LR
    Client -->|POST /v1/chat| Gateway
    Gateway -->|POST /retrieve| Retriever
    Gateway -->|POST /embed| Embedder
    Gateway -->|POST /generate| ModelProxy[model-proxy]
    Gateway -->|INSERT usage_events| PG[(Postgres\nuser: lab)]
    Retriever -->|SELECT chunks/embeddings| PG

    style PG fill:#e5534b,stroke:#f0883e,stroke-width:3px,color:#fff
    PG -.->|"FATAL: password authentication failed for user \"lab\"\n(stale secret/subject-db-credentials vs rotated vault password)"| Retriever

    classDef broken stroke:#e5534b,stroke-width:3px
    class Retriever broken
```
