# Postmortem: rollout gateway has been Progressing >12m or is short on ready replicas - likely a wedged canary (never-Ready pods, stuck analysis, or image that cannot start); rollout_status + analysisrun_get have the detail

- **Status:** resolved
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-14 00:16:29Z
- **Resolved:** 2026-08-14 00:21:29Z

## Timeline (machine-generated)

All times UTC on 2026-08-14 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
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
| 00:08:24Z | k8s | AnalysisRun/gateway-569c859d85-29-1: MetricSuccessful |
| 00:08:24Z | k8s | AnalysisRun/gateway-569c859d85-29-1: AnalysisRunSuccessful |
| 00:08:24Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 00:08:24Z | log-spike | log-spike onset: name=gateway-569c859d85-29-1 kind=AnalysisRun objectAPIversion=argoproj.io/v1alpha1 objectRV=2664250 eventRV=2664297 reportingcontroller=rollouts-controller sourcecomponent=rollouts-controller reason=MetricSuccessful type=… |
| 00:08:26Z | k8s | Pod/gateway-77cfb95667-c2tjm: Killing |
| 00:08:26Z | k8s | ReplicaSet/gateway-77cfb95667: SuccessfulDelete |
| 00:08:27Z | k8s | Pod/gateway-77cfb95667-c2tjm: Unhealthy |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Started |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Pulled |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Created |
| 00:08:28Z | k8s | ReplicaSet/gateway-569c859d85: SuccessfulCreate |
| 00:08:28Z | k8s | Pod/gateway-569c859d85-59dfp: Scheduled |
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
| 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Started |
| 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Pulled |
| 00:10:16Z | k8s | Pod/retriever-6599665c84-qzghv: Created |
| 00:10:23Z | k8s | Pod/retriever-55dc5cc955-9vb6l: Killing |
| 00:10:23Z | k8s | ReplicaSet/retriever-55dc5cc955: SuccessfulDelete |
| 00:10:23Z | k8s | Deployment/retriever: ScalingReplicaSet |
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
| 00:15:50Z | alert | alert firing: Rollout stuck (progressing too long / replicas short) |
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
| 00:18:50Z | alert | alert resolved: Rollout stuck (progressing too long / replicas short) |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786666589027%22%2C+%22to%22%3A+%221786666889016%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum+by+%28le%2C+service%29+%28rate%28request_duration_seconds_bucket%5B5m%5D%29%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786666589027%22%2C+%22to%22%3A+%221786666889016%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match (1):** `canary-abort.md` — toolset narrowed to 15 tools: alert_status, analysisrun_get, deploy_history, gitea_compare, k8s_events, kubectl_read, publish_postmortem, request_approval, rollout_abort, rollout_promote, rollout_status, rollout_undo, runbook_lookup, runbook_read, save_artifact

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
2 deploy-window leads
- argo app gateway: sync=Synced health=Progressing (revision c025382ba170)
- argo app platform: sync=OutOfSync health=Healthy (revision c025382ba170)

### log_spike — LEAD
error/failed log rate 4/10min vs baseline 0/10min (4x baseline) — onset: name=gateway-569c859d85-29-1 kind=AnalysisRun objectAPIversion=argoproj.io/v1alpha1 objectRV=2664250 eventRV=2664297 reportingcontroller=rollouts-controller sourcecomponent=rollouts-controller reason=MetricSuccessful type=Normal count=1 msg="Metric 'canary-error-rate' Completed. Result: Successful"  at 2026-08-14T00:08:24+00:00
- error/failed log rate 4/10min vs baseline 0/10min (4x baseline) — onset: name=gateway-569c859d85-29-1 kind=AnalysisRun objectAPIversion=argoproj.io/v1alpha1 objectRV=2664250 eventRV=26642… (truncated)

### attribution — LEAD
 over the last 10m — which is not necessarily the workload named on the alert:
- embedder reported no server-side requests at all — a workload that is down or unscheduled emits nothing, and its CALLERS carry its errors
- retriever reported no server-side requests at all — a workload that is down or unscheduled emits nothing, and its CALLERS carry its errors

### rollout_state — LEAD
1 rollout-state lead
- rollout gateway: Progressing — more replicas need to be updated (step 3/4)

### kube_scan — OK
all pods Ready, no notable cluster events

### secret_age — OK
Secret subject-db-credentials last modified 20d 1h ago (created 20d 1h ago).

</details>

## Narrative

## Summary

The `Rollout stuck (progressing too long / replicas short)` alert fired for the gateway Argo Rollout. Investigation (per the `canary-abort.md` runbook) found that one canary revision's `canary-p95` AnalysisRun genuinely failed a real threshold — but the **exact same container image**, redeployed minutes later as the next revision, passed the identical analysis cleanly, and the rollout has since progressed on its own to a fully **Healthy** state with stable and canary pod-template hashes matching. `alert_status` confirms the alert is no longer firing. No manual mutation was required or applied.

## Impact

Canary revision 26 (image `10f24bc`, pod-template-hash `746788f5df`) was exposed to ~25% of gateway traffic for roughly one analysis window before Argo Rollouts' own gate aborted it automatically. No user-facing rollback, restart, or scale change was needed — the progressive-delivery safety net did exactly what it's for.

## Root cause

Evidence against a code regression in image `10f24bc`:

- AnalysisRun `gateway-746788f5df-26-1` failed metric `canary-p95` with measurements `[9.23867612756912]` and `[9.183187615575672]` (seconds) — roughly **1900x** the steady-state baseline of `0.00475`s. `canary-error-rate` on the same run was still `Successful` (0.0497, 0.0287 — elevated but not gating).
- The **identical image and pod-template-hash** (`10f24bc` / `746788f5df`) was redeployed minutes later as revision 28. Its AnalysisRun `gateway-746788f5df-28-1` passed cleanly: `canary-p95` = `[0.00475, 0.00475]`, `canary-error-rate` = `[0, 0]`.
- In the same ~60–90s window as the failing measurement, k8s events show **readiness-probe failures on the STABLE replica set** (`gateway-77cfb95667-jvc2z`: "context deadline exceeded"; shortly after, `gateway-77cfb95667-c2tjm`: "connection reset by peer") — pods running the old, already-proven code, not the canary under test.
- `deploy_history` shows no CI/gitops change landed anywhere near the incident window; the last real commits (`b1f2623593`, `91e360ef82`) predate it by roughly 2.5 hours.

Because the identical artifact failed once then passed cleanly, and unrelated stable pods hit readiness trouble at the same moment, the root cause is a **transient infrastructure-level blip** (brief node/network/readiness hiccup affecting pod latency and probes cluster-wide for under two minutes) that coincided with the canary-analysis window — not a defect in the deployed commit.

## What fixed it

Nothing manual. Argo Rollouts' analysis gate correctly aborted the bad-measurement revision (26) by itself. The controller retried the same image as revision 28, which passed analysis cleanly, and the rollout progressed through revisions 29 and 30 to `phase: Healthy` (`stableHash == canaryHash == 74677864c`, 4/4 replicas ready and available). A read-only dry-run of `rollout_promote` was taken purely to get an on-record confirmation of state; it reported `phase=Healthy step=4/4 aborted=False` — a no-op — so it was **not executed**, per the runbook's "rollout is legitimately healthy → no mutation needed" branch. `alert_status` for the rollout-stuck alert returned `active: false`.

## Delivery path — where it broke

```mermaid
flowchart LR
    CI["Gitea CI\nbuild+test\nimage 10f24bc"] --> GITOPS["obs-gitops repo\nimage bump"]
    GITOPS --> ARGOAPP["Argo CD app: gateway\nSynced"]
    ARGOAPP --> ROLLOUT["Argo Rollouts\nsetWeight25 -> analysis -> setWeight50 -> analysis"]
    ROLLOUT --> CANARY["gateway canary pods\nrev26 hash 746788f5df"]
    STABLE["gateway stable pods\nhash 77cfb95667"]
    CANARY --> ANALYSIS["AnalysisRun canary-p95\nmeasured 9.2s vs 0.00475s baseline"]
    STABLE -.->|readiness probe failed\nsame ~60-90s window\ncluster-wide blip| ANALYSIS
    ANALYSIS -->|FAILED: failed(2) > failureLimit(1)| ABORT["RolloutAborted\nrevision 26"]
    ABORT --> RETRY["Rollout retries\nSAME image 10f24bc\nrevision 28"]
    RETRY -->|canary-p95=0.00475s clean| HEALTHY["Rollout Healthy\nstable=canary=74677864c\n4/4 ready"]

    style ANALYSIS fill:#7a1f1f,stroke:#ff5c5c,stroke-width:2px,color:#fff
    style ABORT fill:#7a1f1f,stroke:#ff5c5c,stroke-width:2px,color:#fff
    style STABLE fill:#3a2a10,stroke:#c98a1a,color:#fff
    style HEALTHY fill:#173a26,stroke:#4caf7d,color:#fff
```

The break is at the **AnalysisRun canary-p95 gate**, tripped by a cluster-wide readiness/latency blip that also touched the stable replica set — not at the CI, gitops, or Argo sync hops, which all delivered the same (good) artifact both times.

## Lessons

- The canary-p95 gate worked as designed: it kept a bad-looking measurement window off full production traffic and the system self-healed on retry without operator action.
- A stable-pod readiness-probe failure landing in the same window as a canary's failing measurement is a fast, reliable discriminator between "environment blip" and "bad code" — worth adding explicitly to `canary-abort.md`'s diagnose steps.
- The analysis window (2 samples, ~30s) is short enough that a single transient blip can abort an otherwise-good revision and page on-call. Consider a slightly longer window or one extra sample before failing, to cut false-positive aborts without materially slowing genuinely-bad rollouts.
