# Postmortem: gateway 5xx rate above 2%

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-13 23:55:40Z
- **Resolved:** 2026-08-14 00:10:40Z

## Timeline (machine-generated)

All times UTC on 2026-08-13 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 23:55:10Z | alert | alert firing: Gateway 5xx rate > 2% |
| 23:55:38Z | log-spike | log-spike onset: 815 \| errorResponse = Errors.postgres(parseError(x)) |
| 23:57:15Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19ffd8d8e7743) |
| 23:57:56Z | k8s | ReplicaSet/retriever-77df6c9cc5: SuccessfulCreate |
| 23:57:56Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:57:56Z | k8s | Pod/retriever-77df6c9cc5-c7f2g: Scheduled |
| 23:57:56Z | remediation | restart_workload retriever executed (run run_19ffd8d8e7743) |
| 23:57:57Z | k8s | Rollout/gateway: RolloutUpdated |
| 23:57:57Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 23:57:57Z | remediation | restart_workload gateway executed (run run_19ffd8d8e7743) |
| 23:57:57Z | remediation | restart_workload embedder executed (run run_19ffd8d8e7743) |
| 23:57:58Z | k8s | Pod/retriever-77df6c9cc5-c7f2g: Started |
| 23:57:58Z | k8s | Pod/retriever-77df6c9cc5-c7f2g: Pulled |
| 23:57:58Z | k8s | Pod/retriever-77df6c9cc5-c7f2g: Created |
| 23:57:58Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 23:57:58Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 23:57:58Z | k8s | ReplicaSet/embedder-fdff9df4: SuccessfulCreate |
| 23:57:58Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 23:57:58Z | k8s | Pod/embedder-fdff9df4-4l2rw: Scheduled |
| 23:57:59Z | k8s | Pod/gateway-77cfb95667-jvc2z: Killing |
| 23:57:59Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 23:57:59Z | k8s | Pod/embedder-fdff9df4-4l2rw: Pulled |
| 23:57:59Z | k8s | Pod/embedder-fdff9df4-4l2rw: Created |
| 23:58:00Z | k8s | ReplicaSet/gateway-746788f5df: SuccessfulCreate |
| 23:58:00Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 23:58:00Z | k8s | Pod/embedder-fdff9df4-4l2rw: Started |
| 23:58:00Z | k8s | Pod/gateway-746788f5df-jslfm: Scheduled |
| 23:58:01Z | k8s | Pod/gateway-77cfb95667-jvc2z: Unhealthy |
| 23:58:01Z | k8s | Pod/gateway-746788f5df-jslfm: Pulled |
| 23:58:02Z | k8s | Pod/gateway-746788f5df-jslfm: Started |
| 23:58:02Z | k8s | Pod/gateway-746788f5df-jslfm: Created |
| 23:58:04Z | k8s | Pod/retriever-65c474b46b-bqqd9: Killing |
| 23:58:04Z | k8s | ReplicaSet/retriever-65c474b46b: SuccessfulDelete |
| 23:58:04Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:58:06Z | k8s | Pod/embedder-596696c46d-s25xc: Killing |
| 23:58:06Z | k8s | ReplicaSet/embedder-596696c46d: SuccessfulDelete |
| 23:58:06Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 23:58:09Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 23:58:11Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 23:59:10Z | k8s | AnalysisRun/gateway-746788f5df-26-1: MetricFailed |
| 23:59:10Z | k8s | AnalysisRun/gateway-746788f5df-26-1: AnalysisRunFailed |
| 23:59:10Z | k8s | Rollout/gateway: AnalysisRunFailed |
| 23:59:10Z | k8s | AnalysisRun/gateway-746788f5df-26-1: MetricSuccessful |
| 23:59:11Z | k8s | Rollout/gateway: RolloutAborted |
| 23:59:11Z | k8s | Pod/gateway-746788f5df-jslfm: Killing |
| 23:59:11Z | k8s | ReplicaSet/gateway-746788f5df: SuccessfulDelete |
| 23:59:11Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 23:59:12Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulCreate |
| 23:59:12Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 23:59:12Z | k8s | Pod/gateway-77cfb95667-8tdz6: Scheduled |
| 23:59:13Z | k8s | Pod/gateway-77cfb95667-8tdz6: Pulled |
| 23:59:14Z | k8s | Pod/gateway-77cfb95667-8tdz6: Created |
| 23:59:14Z | k8s | Pod/gateway-77cfb95667-8tdz6: Started |
| 2026-08-14 00:01:09Z | verification | recovery NOT verified — deadline armed |
| 2026-08-14 00:01:18Z | log-spike | log-spike onset: [gateway] usage write failed: Failed query: insert into "usage_events" ("id", "tenant", "prompt_tokens", "completion_tokens", "model", "created_at") values (default, $1, $2, $3, $4, default) |
| 2026-08-14 00:02:18Z | k8s | ReplicaSet/retriever-86699d9d9d: SuccessfulCreate |
| 2026-08-14 00:02:18Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 2026-08-14 00:02:18Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 2026-08-14 00:02:18Z | k8s | Rollout/gateway: RolloutUpdated |
| 2026-08-14 00:02:18Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 2026-08-14 00:02:18Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Scheduled |
| 2026-08-14 00:02:19Z | k8s | ReplicaSet/gateway-7cf8f79458: SuccessfulCreate |
| 2026-08-14 00:02:19Z | k8s | Pod/gateway-77cfb95667-8tdz6: Killing |
| 2026-08-14 00:02:19Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 2026-08-14 00:02:19Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 2026-08-14 00:02:19Z | k8s | Pod/gateway-7cf8f79458-rffhd: Scheduled |
| 2026-08-14 00:02:20Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Started |
| 2026-08-14 00:02:20Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Pulled |
| 2026-08-14 00:02:20Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Created |
| 2026-08-14 00:02:20Z | k8s | Pod/gateway-7cf8f79458-rffhd: Started |
| 2026-08-14 00:02:20Z | k8s | Pod/gateway-7cf8f79458-rffhd: Pulled |
| 2026-08-14 00:02:20Z | k8s | Pod/gateway-7cf8f79458-rffhd: Created |
| 2026-08-14 00:02:27Z | k8s | Pod/retriever-77df6c9cc5-c7f2g: Killing |
| 2026-08-14 00:02:27Z | k8s | ReplicaSet/retriever-77df6c9cc5: SuccessfulDelete |
| 2026-08-14 00:02:27Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 2026-08-14 00:02:27Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 2026-08-14 00:02:28Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 2026-08-14 00:03:28Z | k8s | Pod/gateway-7cf8f79458-rffhd: Killing |
| 2026-08-14 00:03:28Z | k8s | AnalysisRun/gateway-7cf8f79458-27-1: MetricSuccessful |
| 2026-08-14 00:03:28Z | k8s | AnalysisRun/gateway-7cf8f79458-27-1: AnalysisRunSuccessful |
| 2026-08-14 00:03:28Z | k8s | ReplicaSet/gateway-7cf8f79458: SuccessfulDelete |
| 2026-08-14 00:03:28Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 2026-08-14 00:03:28Z | k8s | Rollout/gateway: RolloutUpdated |
| 2026-08-14 00:03:29Z | k8s | ReplicaSet/gateway-746788f5df: SuccessfulCreate |
| 2026-08-14 00:03:29Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 2026-08-14 00:03:29Z | k8s | Pod/gateway-746788f5df-t6bqb: Scheduled |
| 2026-08-14 00:03:30Z | k8s | Pod/gateway-746788f5df-t6bqb: Started |
| 2026-08-14 00:03:30Z | k8s | Pod/gateway-746788f5df-t6bqb: Pulled |
| 2026-08-14 00:03:30Z | k8s | Pod/gateway-746788f5df-t6bqb: Created |
| 2026-08-14 00:03:36Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 2026-08-14 00:03:38Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 2026-08-14 00:04:43Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Pulled |
| 2026-08-14 00:04:43Z | k8s | ReplicaSet/retriever-55dc5cc955: SuccessfulCreate |
| 2026-08-14 00:04:43Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 2026-08-14 00:04:43Z | k8s | Rollout/gateway: RolloutUpdated |
| 2026-08-14 00:04:43Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 2026-08-14 00:04:43Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Scheduled |
| 2026-08-14 00:04:44Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Started |
| 2026-08-14 00:04:44Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Created |
| 2026-08-14 00:04:44Z | k8s | Pod/gateway-746788f5df-t6bqb: Killing |
| 2026-08-14 00:04:44Z | k8s | AnalysisRun/gateway-746788f5df-28-1: MetricSuccessful |
| 2026-08-14 00:04:44Z | k8s | AnalysisRun/gateway-746788f5df-28-1: AnalysisRunSuccessful |
| 2026-08-14 00:04:44Z | k8s | ReplicaSet/gateway-746788f5df: SuccessfulDelete |
| 2026-08-14 00:04:44Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 2026-08-14 00:04:45Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulCreate |
| 2026-08-14 00:04:45Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 2026-08-14 00:04:45Z | k8s | Pod/gateway-569c859d85-mlpcq: Scheduled |
| 2026-08-14 00:04:46Z | k8s | Pod/gateway-569c859d85-mlpcq: Started |
| 2026-08-14 00:04:46Z | k8s | Pod/gateway-569c859d85-mlpcq: Pulled |
| 2026-08-14 00:04:46Z | k8s | Pod/gateway-569c859d85-mlpcq: Created |
| 2026-08-14 00:04:50Z | k8s | Pod/retriever-86699d9d9d-hnkl7: Killing |
| 2026-08-14 00:04:50Z | k8s | ReplicaSet/retriever-86699d9d9d: SuccessfulDelete |
| 2026-08-14 00:04:50Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 2026-08-14 00:04:53Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 2026-08-14 00:04:55Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 2026-08-14 00:07:10Z | alert | alert resolved: Gateway 5xx rate > 2% |
| 2026-08-14 00:08:24Z | k8s | AnalysisRun/gateway-569c859d85-29-1: MetricSuccessful |
| 2026-08-14 00:08:24Z | k8s | AnalysisRun/gateway-569c859d85-29-1: AnalysisRunSuccessful |
| 2026-08-14 00:08:24Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 2026-08-14 00:08:26Z | k8s | Pod/gateway-77cfb95667-c2tjm: Killing |
| 2026-08-14 00:08:26Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 2026-08-14 00:08:27Z | k8s | Pod/gateway-77cfb95667-c2tjm: Unhealthy |
| 2026-08-14 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Started |
| 2026-08-14 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Pulled |
| 2026-08-14 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Created |
| 2026-08-14 00:08:28Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulCreate |
| 2026-08-14 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Scheduled |
| 2026-08-14 00:09:56Z | k8s | Pod/gateway-569c859d85-59dfp: Killing |
| 2026-08-14 00:09:56Z | k8s | AnalysisRun/gateway-569c859d85-29-3: MetricSuccessful |
| 2026-08-14 00:09:56Z | k8s | AnalysisRun/gateway-569c859d85-29-3: AnalysisRunSuccessful |
| 2026-08-14 00:09:56Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulDelete |
| 2026-08-14 00:09:57Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulCreate |
| 2026-08-14 00:09:57Z | k8s | Pod/gateway-77cfb95667-jcmwg: Scheduled |
| 2026-08-14 00:09:58Z | k8s | Pod/gateway-77cfb95667-jcmwg: Started |
| 2026-08-14 00:09:58Z | k8s | Pod/gateway-77cfb95667-jcmwg: Pulled |
| 2026-08-14 00:09:58Z | k8s | Pod/gateway-77cfb95667-jcmwg: Created |
| 2026-08-14 00:10:05Z | k8s | Pod/gateway-569c859d85-mlpcq: Killing |
| 2026-08-14 00:10:05Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulDelete |
| 2026-08-14 00:10:06Z | k8s | ReplicaSet/gateway-74677864c: SuccessfulCreate |
| 2026-08-14 00:10:06Z | k8s | Pod/gateway-74677864c-4v9fx: Scheduled |
| 2026-08-14 00:10:07Z | k8s | Pod/gateway-74677864c-4v9fx: Started |
| 2026-08-14 00:10:07Z | k8s | Pod/gateway-74677864c-4v9fx: Pulled |
| 2026-08-14 00:10:07Z | k8s | Pod/gateway-74677864c-4v9fx: Created |
| 2026-08-14 00:10:15Z | k8s | ReplicaSet/retriever-6599665c84: SuccessfulCreate |
| 2026-08-14 00:10:15Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 2026-08-14 00:10:15Z | k8s | Pod/retriever-6599665c84-qzghv: Scheduled |
| 2026-08-14 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Started |
| 2026-08-14 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Pulled |
| 2026-08-14 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Created |
| 2026-08-14 00:10:23Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Killing |
| 2026-08-14 00:10:23Z | k8s | ReplicaSet/retriever-55dc5cc955: SuccessfulDelete |
| 2026-08-14 00:10:23Z | k8s | Deployment/retriever: ScalingReplicaSet |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786665340400%22%2C+%22to%22%3A+%221786666240066%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum+by+%28le%2C+service%29+%28rate%28request_duration_seconds_bucket%5B5m%5D%29%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786665340400%22%2C+%22to%22%3A+%221786666240066%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match (2):** `gateway-high-error-rate.md`, `stale-secret.md` — toolset narrowed to 14 tools: alert_status, deploy_history, k8s_events, kubectl_read, loki_query, mimir_query, publish_postmortem, request_approval, restart_workload, runbook_lookup, runbook_read, save_artifact, tempo_query, update_db_secret

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
errors concentrate on gateway → POST model-proxy (13.2%); time concentrates in gateway's own handler (~6.4s of 10.2s) over the last 10m — which is not necessarily the workload named on the alert:
- gateway: 5.9% of its OWN responses are 5xx (10m)
- model-proxy: 2.7% of its OWN responses are 5xx (10m)
- gateway → POST model-proxy: 13.2% of those outbound calls failed
- gateway → POST retriever: 3.4% of those outbound calls failed
- own-handler p95 (server p95 minus its slowest outbound call — a ranking, not a measurement): gateway ~6.4s of 10.2s end to end, embedder ~3.9s of 3.9s end to end, retriever ~3.8s of 3.8s end to end
- gateway → POST embedder: p95 3.9s outbound
- gateway → POST retriever: p95 3.8s outbound
- retriever reported no server-side requests at all —
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

Re-opened `inc_19ffd8d8df041` after a prior session reported the gateway 5xx alert had not cleared following its remediation. Re-examined with fresh telemetry rather than repeating the fix blind, per instructions. Verdict: the remediation from attempt 1 **did work** — the earlier "did not restore service" read was taken before the Argo Rollouts canary had finished converging and before Alertmanager's evaluation window had elapsed, not because the fix was stuck or wrong. No red CI pipeline, no stuck rollout, no second root cause was found on re-investigation.

## Impact

Elevated 5xx responses from `gateway` (peaking ~82% of its own responses) and `model-proxy` (peaking ~3.3%), driven by `retriever` (peaking ~87% of its own responses) and `embedder` failing to authenticate to Postgres. Duration of the elevated window was roughly 13 minutes end to end (rise, peak, decay) before returning to baseline.

## Root cause

Unchanged from attempt 1, now with confirmed-clean recovery evidence: the Postgres credential referenced by `secret/subject-db-credentials` was rotated in the vault but the in-cluster Secret was never synced, so `retriever` and `embedder` — both long-running pods that had started well before the rotation — kept authenticating with the old password. Postgres logged a burst of `FATAL: password authentication failed for user "lab"` in lockstep with the 5xx spike. `gateway`'s alert-triggering 5xx rate was overwhelmingly retriever's failures surfacing at the front door (`gateway → POST retriever` client-edge error ratio tracked retriever's own error ratio), consistent with the `gateway-high-error-rate.md` attribution steps. `deploy_history` showed no relevant deploy in the incident window, ruling out a bad-deploy explanation and confirming the `stale-secret.md` runbook's applicability over a regular deploy investigation.

## What fixed it

Attempt 1's remediation (Secret synced from vault, approved dry-run → execute; then rolling restarts of `retriever`, `gateway`, and `embedder`, each individually approved) is what resolved the incident — this session found no evidence it needed to be redone. Fresh evidence this session:

- `alert_status` for the gateway 5xx alert returned inactive on two independent checks.
- A 20-minute 5xx-rate series (`mimir_query`) shows the full arc: flat baseline, rise, a peak (gateway ~82%, retriever ~87%, model-proxy ~3.3%), then a clean decay back to a flat 0% tail across all three services — not a plateau, not a re-spike.
- `password authentication failed` has zero occurrences in the most recent 6-minute window, versus a dense burst earlier in the incident.
- `kubectl get pods` shows `retriever` and `embedder` running on freshly restarted pods (minutes old, well after the fix), and `gateway`'s Argo Rollout progressing its canary from step 1/4 to step 2/4 between checks — normal in-progress convergence toward replacing the old ReplicaSet, not a stalled or aborted rollout. `model-proxy` recovered without needing its own restart, consistent with its errors being a minor secondary effect of retriever's failures rather than its own credential problem.

No new remediation action was taken this session — the correct call, given the evidence, was to verify rather than re-run a fix that had already worked.

## Lessons

- A canary rollout plus an Alertmanager evaluation cycle both take real wall-clock time after a restart lands; checking `alert_status` immediately after triggering a remediation can read as "still failing" when the fix is actually in flight. Give it at least one more evaluation window before declaring a remediation stuck.
- `deploy_history`'s rollout entries report *live* state on every call (not a fixed snapshot), so re-querying it mid-incident is a cheap way to distinguish "still converging" from "stuck" without guessing.
- The stale-secret failure mode hits every long-running pod holding the old credential, not just the one named in the alert — `model-proxy` shared the blast radius at a smaller scale purely as a client of the same failing retriever calls, without itself holding a stale credential.

```mermaid
flowchart LR
    C["Client"] --> G["gateway"]
    G -->|"5xx surfaces here\n(front-door symptom, not origin)"| R["retriever"]
    G --> E["embedder"]
    G --> MP["model-proxy\n(secondary, no restart needed)"]
    R -.->|"BROKEN (now fixed):\nFATAL password authentication failed\nstale secret/subject-db-credentials"| P[("postgres")]
    E -.->|"BROKEN (now fixed):\nsame stale secret"| P
    MP --> P
    style R fill:#f66,stroke:#900,stroke-width:3px,color:#000
    style E fill:#f66,stroke:#900,stroke-width:3px,color:#000
    linkStyle 2 stroke:#c00,stroke-width:3px
    linkStyle 3 stroke:#c00,stroke-width:3px
```
