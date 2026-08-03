# Postmortem: gateway availability error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-03 00:00:44Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-02 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 23:11:35Z | deploy:ci | CI run #108 success on main: obs: model-proxy: pre-warm the completion path before generating |
| 23:12:23Z | deploy:ci | CI run #109 success on main: obs: Revert "model-proxy: pre-warm the completion path before generating" |
| 23:15:53Z | k8s | Job/seed: SuccessfulCreate |
| 23:15:53Z | k8s | Pod/seed-d9gxh: Scheduled |
| 23:15:54Z | k8s | Pod/seed-d9gxh: Started |
| 23:15:54Z | k8s | Pod/seed-d9gxh: Pulled |
| 23:15:54Z | k8s | Pod/seed-d9gxh: Created |
| 23:15:58Z | deploy:annotation | deploy platform via gitops 1142aba (argo sync) |
| 23:15:59Z | k8s | Job/seed: Completed |
| 23:19:25Z | k8s | Job/seed: SuccessfulCreate |
| 23:19:25Z | k8s | Pod/seed-nxgx9: Scheduled |
| 23:19:27Z | k8s | Pod/seed-nxgx9: Started |
| 23:19:27Z | k8s | Pod/seed-nxgx9: Pulled |
| 23:19:27Z | k8s | Pod/seed-nxgx9: Created |
| 23:19:30Z | deploy:annotation | deploy platform via gitops e288291 (argo sync) |
| 23:19:32Z | k8s | Job/seed: Completed |
| 23:21:53Z | k8s | Pod/seed-gt5kx: Started |
| 23:21:53Z | k8s | Pod/seed-gt5kx: Pulled |
| 23:21:53Z | k8s | Pod/seed-gt5kx: Created |
| 23:21:53Z | k8s | Job/seed: SuccessfulCreate |
| 23:21:53Z | k8s | Pod/seed-gt5kx: Scheduled |
| 23:21:56Z | deploy:annotation | deploy platform via gitops be28f82 (argo sync) |
| 23:21:57Z | k8s | Job/seed: Completed |
| 23:24:20Z | k8s | Pod/seed-kw89t: Pulled |
| 23:24:20Z | k8s | Pod/seed-kw89t: Created |
| 23:24:20Z | k8s | Job/seed: SuccessfulCreate |
| 23:24:20Z | k8s | Pod/seed-kw89t: Scheduled |
| 23:24:21Z | k8s | Pod/seed-kw89t: Started |
| 23:24:24Z | deploy:annotation | deploy platform via gitops 21f3422 (argo sync) |
| 23:24:25Z | k8s | Job/seed: Completed |
| 23:31:57Z | k8s | Rollout/gateway: RolloutUpdated |
| 23:31:57Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 23:31:57Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 23:31:58Z | k8s | Pod/gateway-dd85945b4-bgsvz: Killing |
| 23:31:58Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 23:31:58Z | k8s | ReplicaSet/gateway-8444846b5f: SuccessfulCreate |
| 23:31:58Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 23:31:59Z | k8s | Pod/gateway-8444846b5f-tlwpd: Scheduled |
| 23:32:01Z | k8s | Pod/gateway-8444846b5f-tlwpd: Started |
| 23:32:01Z | k8s | Pod/gateway-8444846b5f-tlwpd: Pulled |
| 23:32:01Z | k8s | Pod/gateway-8444846b5f-tlwpd: Created |
| 23:32:09Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 23:32:11Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 23:32:13Z | k8s | Pod/gateway-8444846b5f-tlwpd: Unhealthy |
| 23:32:13Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulCreate |
| 23:32:13Z | k8s | Pod/gateway-8444846b5f-tlwpd: Killing |
| 23:32:13Z | k8s | AnalysisRun/gateway-8444846b5f-11-1: AnalysisRunSuccessful |
| 23:32:13Z | k8s | ReplicaSet/gateway-8444846b5f: SuccessfulDelete |
| 23:32:13Z | k8s | Rollout/gateway: SkipSteps |
| 23:32:13Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 23:32:13Z | k8s | Rollout/gateway: RolloutUpdated |
| 23:32:13Z | k8s | Pod/gateway-dd85945b4-rhws5: Scheduled |
| 23:32:16Z | k8s | Pod/gateway-dd85945b4-rhws5: Started |
| 23:32:16Z | k8s | Pod/gateway-dd85945b4-rhws5: Pulled |
| 23:32:16Z | k8s | Pod/gateway-dd85945b4-rhws5: Created |
| 23:32:21Z | deploy:annotation | deploy gateway via gitops bb634a3 (argo sync) |
| 23:33:59Z | k8s | ReplicaSet/retriever-8454db56c: SuccessfulCreate |
| 23:33:59Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:33:59Z | k8s | Pod/retriever-8454db56c-msr56: Scheduled |
| 23:34:00Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:34:00Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:34:01Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:34:03Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:34:03Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:34:03Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:34:05Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:06Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:10Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:15Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:34:15Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:34:15Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:34:17Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:18Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:20Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:43Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:34:43Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:34:43Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:34:44Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:46Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:34:50Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:35:36Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:35:36Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:35:37Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:35:39Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:35:40Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:36:50Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:36:58Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:36:58Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:36:58Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:36:59Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:37:00Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:37:03Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:38:05Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:39:26Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:39:40Z | k8s | Pod/retriever-8454db56c-msr56: Started |
| 23:39:40Z | k8s | Pod/retriever-8454db56c-msr56: Pulled |
| 23:39:40Z | k8s | Pod/retriever-8454db56c-msr56: Created |
| 23:39:41Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:39:43Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:39:50Z | k8s | Pod/retriever-8454db56c-msr56: BackOff |
| 23:41:01Z | k8s | ReplicaSet/retriever-8454db56c: SuccessfulDelete |
| 23:41:01Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:59:35Z | deploy:ci | CI run #110 failure on main: obs: load-generator: drop the defensive copy in percentile() |
| 2026-08-03 00:00:10Z | alert | alert firing: SLO gateway availability — slow burn |
| 2026-08-03 00:03:57Z | deploy:ci | CI run #111 success on main: obs: Revert "load-generator: drop the defensive copy in percentile()" |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785715244351%22%2C+%22to%22%3A+%221785715576617%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785715244351%22%2C+%22to%22%3A+%221785715576617%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
5 deploy-window leads
- deploy annotation at 2026-08-02T23:15:58.434000+00:00: deploy platform via gitops 1142aba (argo sync)
- deploy annotation at 2026-08-02T23:19:30.778000+00:00: deploy platform via gitops e288291 (argo sync)
- deploy annotation at 2026-08-02T23:21:56.437000+00:00: deploy platform via gitops be28f82 (argo sync)
- deploy annotation at 2026-08-02T23:24:24.266000+00:00: deploy platform via gitops 21f3422 (argo sync)
- deploy annotation at 2026-08-02T23:32:21.618000+00:00: deploy gateway via gitops bb634a3 (argo sync)

### log_spike — OK
error/failed log rate normal: 0/10min vs baseline 62/10min

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 02:00:45.427028   29648 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 02:00:45.593765   29648 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 02:00:45.702809   29648 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 02:00:45.475773   46808 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 02:00:45.599594   46808 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

Gateway's SLO availability burn-rate alert (sev2, slow burn — 10% of 28d error budget in 6h) fired for tenant acme. Root cause: a burst of five gitops syncs against `subject/gateway` and its shared `platform` config in a ~17-minute span thrashed the gateway Deployment through a chain of broken ReplicaSets before the final sync landed a healthy image. The 5-minute error ratio for `POST /v1/chat` peaked at ~55% before falling back to 0 and has stayed at 0 for the last 30+ minutes of this investigation — the outage itself is already over; the alert is still technically active only because it is a multi-window (30m/6h) burn-rate rule and those longer windows haven't yet rolled the historical spike out.

## Impact

`POST /v1/chat` on gateway (tenant acme) saw error ratio climb from a ~7% baseline noise floor to a peak of ~55% over roughly 15 minutes, driven by pods in `ImagePullBackOff` / failing readiness across several churned ReplicaSets. Traffic briefly dropped to near-zero throughput during the worst of the churn. No sustained full outage — capacity was restored once the working revision stabilized.

## Root cause

Evidence chain, oldest to newest:
- `deploy_history`/`grafana_annotations`: 5 gitops syncs in ~17 minutes — 4× `platform` (`1142aba`, `e288291`, `be28f82`, `21f3422`) followed by `gateway` (`bb634a3`).
- `k8s_events` (Loki-backed, spanning the window): gateway pods cycled through at least 9 distinct ReplicaSet hashes, including `gateway-865966ff97-tsxfh` hitting `Failed to pull image "obs-registry:5010/gateway:phantom" ... NotFound / ImagePullBackOff` — a non-existent image tag — plus other generations failing readiness with `HTTP probe ... 404` and `connection refused`, and repeated `BackOff` restarts.
- `mimir_query` on `slo:gateway_availability:error_ratio5m` (30m range): ratio rose steadily from ~3.5% to a peak of 0.5496 (~55%) around the point the churn was worst, then dropped to 0 and has held there.
- `mimir_query` on `kube_replicaset_status_ready_replicas`: 9 older gateway ReplicaSets at 0 ready replicas; only the final `gateway-dd85945b4` (image `gateway:10f24bc`) shows 4/4 ready, matching a pod-Started event at the same timestamp as the `bb634a3` gitops sync.
- No corresponding error-rate spike on `model-proxy`/`retriever`/`embedder` server spans outside what gateway itself drove — this was a gateway rollout problem, not a downstream dependency failure.

The `platform`-tagged gitops commits (`1142aba`…`21f3422`) could not be diffed directly (they live in the gitops repo, out of scope for `gitea_compare` against `obs/obs-lab`), but the timing and the `phantom`-tag ImagePullBackOff make it clear one or more of those rapid syncs pushed a bad manifest/image reference for gateway before it was corrected forward by `bb634a3`.

## What fixed it

The problem was already forward-fixed by the last gitops sync (`bb634a3`, image `gateway:10f24bc`) landing a working revision — `slo:gateway_availability:error_ratio5m` had already been at 0 for ~30 minutes of observation before any remediation was attempted by this on-call session.

As a precaution, a rolling restart of `deployment/gateway` was dry-run, its diff attached, and approved by the operator (`request_approval` → approved). Execution (`restart_workload`, `dry_run=false`) failed with `error: You must be logged in to the server (Unauthorized)` — the same cluster-credential failure that blocked `kubectl_read`, `argo_app`, and `rollout_status` throughout this investigation (a standing environment/RBAC issue for the remediation identity, not a fact about the incident). The restart could not be executed. Given telemetry already showed sustained recovery (4/4 ready replicas on the current ReplicaSet, 0 restarts, 0% error ratio for 30+ minutes) independent of that restart, no further remediation was attempted.

`alert_status` remained `active` at last check — expected, since the 30m and 6h burn windows (18.2% and 8.4% respectively) still contain the historical spike and will age out on their own; this is not evidence of an ongoing outage.

## Lessons

- The gitops pipeline allowed 5 syncs to gateway/platform inside 17 minutes with no visible gate between them — at least one pushed a non-existent image tag (`phantom`). A pre-sync image-existence check (or a canary step before full rollout) would have caught this before it reached pods.
- The agent-remediate cluster credential (used by `restart_workload`/`kubectl_read`/`argo_app`/`rollout_status`) was unauthorized for this entire incident, which meant on-call tooling could not directly confirm rollout state or execute the approved restart — it had to be inferred entirely from Mimir/Loki. This should be fixed independently of any single incident; on-call should not have to work blind to the cluster.
- No runbook matches this exact alertname (`SLO gateway availability — slow burn`); `gateway-high-error-rate.md` was used as the closest analog. Worth authoring a dedicated slow-burn runbook that points straight at `slo:gateway_availability:error_ratio{5m,30m,1h,6h}` and at gitops sync churn as a first-class hypothesis.

```mermaid
flowchart LR
    subgraph Delivery["CI → GitOps → Cluster"]
        CI[obs-lab CI\nmain branch] --> GO[gitops repo\nplatform + gateway manifests]
        GO -->|"5 syncs in 17min\n1142aba,e288291,be28f82,21f3422,bb634a3"| ARGO[Argo CD sync]
        ARGO --> RS[gateway ReplicaSets\n9 revisions churned]
    end
    subgraph Serving["Request path"]
        CLIENT[client] --> GW[gateway :8080]
        GW --> MP[model-proxy :8083]
        GW --> RET[retriever :8082]
        GW --> EMB[embedder :8081]
    end
    RS -->|"BROKEN HOP:\nImagePullBackOff on tag 'phantom'\n+ readiness 404 / conn refused\nacross churned revisions"| GW
    RS -.->|"final sync bb634a3\nimage gateway:10f24bc\n4/4 ready"| GW

    style RS fill:#ef5350,stroke:#b71c1c,color:#fff
    style GW fill:#2b3444,stroke:#4fc3f7,color:#fff
```
