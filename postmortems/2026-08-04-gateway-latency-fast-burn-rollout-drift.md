# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-04 18:37:45Z
- **Resolved:** 2026-08-04 18:47:45Z

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 18:30:05Z | k8s | Rollout/gateway: RolloutUpdated |
| 18:30:05Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 18:30:05Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 18:30:06Z | k8s | Pod/gateway-dd85945b4-jfd54: Killing |
| 18:30:06Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 18:30:06Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:30:07Z | k8s | ReplicaSet/gateway-5785654fc7: SuccessfulCreate |
| 18:30:07Z | k8s | Pod/gateway-5785654fc7-p97mq: Scheduled |
| 18:30:10Z | k8s | Pod/gateway-5785654fc7-p97mq: Started |
| 18:30:10Z | k8s | Pod/gateway-5785654fc7-p97mq: Pulled |
| 18:30:10Z | k8s | Pod/gateway-5785654fc7-p97mq: Created |
| 18:30:16Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:21Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:26Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:31Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:36Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:41Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:46Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:51Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:30:56Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:01Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:06Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:11Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:16Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:21Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:25Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:30Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:35Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:40Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:45Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:50Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:31:55Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:32:00Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:32:05Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:32:10Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:32:15Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:35:19Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:35:56Z | log-spike | log-spike onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"6e38adb011fd4001c92dd46db615df99","span_id":"e6514ac45f5cb6f3","time":"2026-08-04T18:35:56.358Z","reason":"The operation timed out.","job":"ra… |
| 18:37:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 18:38:48Z | k8s | Rollout/gateway: SkipSteps |
| 18:38:48Z | k8s | Rollout/gateway: RolloutUpdated |
| 18:38:49Z | k8s | Pod/gateway-5785654fc7-p97mq: Killing |
| 18:38:49Z | k8s | ReplicaSet/gateway-5785654fc7: SuccessfulDelete |
| 18:38:49Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:38:50Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulCreate |
| 18:38:50Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:38:50Z | k8s | Pod/gateway-dd85945b4-mm7jm: Scheduled |
| 18:38:53Z | k8s | Pod/gateway-dd85945b4-mm7jm: Started |
| 18:38:53Z | k8s | Pod/gateway-dd85945b4-mm7jm: Pulled |
| 18:38:53Z | k8s | Pod/gateway-dd85945b4-mm7jm: Created |
| 18:46:10Z | alert | alert resolved: SLO gateway latency — fast burn |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785868665790%22%2C+%22to%22%3A+%221785869265714%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785868665790%22%2C+%22to%22%3A+%221785869265714%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
1 deploy-window lead
- argo app gateway: sync=OutOfSync health=Progressing (revision bb634a3cd9c3)

### kube_scan — LEAD
26 kube-scan leads
- event Pod/gateway-5785654fc7-p97mq: Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404 (at 20:30:16)
- event Pod/gateway-5785654fc7-p97mq: Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404 (at 20:30:21)
- event Pod/gateway-5785654fc7-p97mq: Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404 (at 20:30:26)
- event Pod/gateway-5785654fc7-p97mq: Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404 (at 20:30:31)
- event Pod/gateway-5785654fc7-p97mq: Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404 (at 20:30:36)
- event Pod/gateway-5785654fc7-p97mq: Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404 (at 20:30:41
… (section truncated)

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"6e38adb011fd4001c92dd46db615df99","span_id":"e6514ac45f5cb6f3","time":"2026-08-04T18:35:56.358Z","reason":"The operation timed out.","job":"rag.inference","eventType":"COMPLETE"} at 2026-08-04T18:35:56.359147+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"6e38adb011fd4001c92dd46db615df… (truncated)

### rollout_state — LEAD
1 rollout-state lead
- rollout gateway: Progressing — more replicas need to be updated (step 0/4)

### secret_age — OK
Secret subject-db-credentials last modified 10d 19h ago (created 10d 19h ago).

</details>

## Narrative

## Summary

The `SLO gateway latency — fast burn` alert (sev1, tenant acme) fired for the `gateway` service. Investigation found the Argo Rollout for `gateway` had drifted out-of-band from its GitOps-declared state to a new pod-template revision whose canary pod never passed its readiness probe. While that pod sat un-Ready, gateway ran under-capacity and every gateway/retriever pod (not just the canary) began timing out on synchronous lineage-emission calls, adding multi-second latency to essentially every `/v1/chat` request. Argo CD's self-heal reverted the drift back to the git-declared revision before any manual remediation was applied; the SLI and alert both confirmed full recovery.

## Impact

`slo:gateway_latency:sli_ratio5m` collapsed from 0.997 to ~0.045–0.05 (95%+ of requests breaching the latency SLO) for roughly 9 minutes, tripping the 5m/1h fast-burn alert. Traces during the window show `POST /v1/chat` root spans of 2.9s–6.1s versus a normal sub-second baseline, with individual internal spans stretching to 1.5–4.8s. `dq_violations` shows sustained `freshness` violations on the `inferences` dataset for every tenant (acme, bravo, abuser) through the window, consistent with requests failing to complete/write promptly.

## Root cause

Evidence chain:
- `argo_app(gateway)` showed `sync=OutOfSync` at alert time, `health=Progressing`, still pinned to the git-declared revision `bb634a3cd9c3` — meaning the *live* Rollout had diverged from what git actually declares.
- `rollout_status(gateway)` showed a new pod-template hash `5785654fc7` (revision 19) fighting for readiness against the stable hash `dd85945b4` (revision 18), stuck at step 0/4 with only 1/4 replicas updated.
- `k8s_events` for `Pod/gateway-5785654fc7-p97mq` show 25+ consecutive `Unhealthy — Readiness probe failed: HTTP probe failed with statuscode: 404` events, and the Rollout event log shows it scaled the stable ReplicaSet **down** from 4→3 to make room for that never-ready canary pod — a genuine capacity cut, not just a cosmetic drift.
- During the exact same window, `loki` shows `"lineage emit failed"` warnings (`reason: "The operation timed out."`) flooding from **both** `gateway` and `retriever`, across pods that were *not* part of the bad rollout (e.g. `gateway-dd85945b4-bnt4c`, 43h-old, never restarted) — ruling out a code/image regression on those pods and pointing at request-path-wide outbound-call disruption coincident with the rollout churn.
- `slo:gateway_latency:sli_ratio5m` drops from 0.997 to 0.045 in the same 60s Mimir sample where the rollout event log places the canary creation/scale-down (`ScalingReplicaSet ... Scaled down ReplicaSet gateway-dd85945b4 (revision 18) from 4 to 3`).
- The moment `argo_app` flips back to `sync=Synced / health=Healthy` and `rollout_status` reports `phase: Healthy, step 4/4, stableHash==canaryHash==dd85945b4, ready=4/4` (Argo's self-heal reverting the out-of-band revision), the `"lineage emit failed"` log stream stops (no further occurrences in the following 10+ minutes) and `slo:gateway_latency:sli_ratio5m` climbs 0.045 → 0.672 → 1.0.

Root cause: an **out-of-band mutation to the `gateway` Argo Rollout** (bypassing GitOps, landing a broken pod-template revision with a failing readiness probe) put the Rollout into a stuck degraded state for ~9 minutes. That degraded state both (a) cut ready capacity 4→3 and (b) coincided with widespread outbound-call timeouts (lineage emission to the OpenLineage/Marquez sink) across every gateway/retriever pod, which is what actually drove the SLO-breaching per-request latency, not merely the one-replica capacity loss. Argo CD's `selfHeal` reconciled the live Rollout back to the git-declared revision `bb634a3cd9c3`/`dd85945b4`, which resolved both symptoms simultaneously.

## What fixed it

No manual mutation was required or applied. Argo CD's self-heal reverted the drifted Rollout spec back to the git-declared stable revision on its own; this was confirmed, not assumed:
- `argo_app(gateway)`: `OutOfSync/Progressing` → `Synced/Healthy` on revision `bb634a3cd9c3`.
- `rollout_status(gateway)`: `phase: Healthy`, `4/4` ready, `stableHash == canaryHash == dd85945b4`.
- `"lineage emit failed"` log stream stopped.
- `slo:gateway_latency:sli_ratio5m` returned to `1.0`.
- `alert_status("SLO gateway latency — fast burn")`: `active: false`.

Per the `canary-abort.md` runbook's mitigation guidance ("no mutation needed — report this as expected-but-slow rather than remediating a healthy rollout"), no `rollout_abort`/`rollout_undo`/restart action was taken once the rollout was independently confirmed `Healthy` and the SLI confirmed recovered — issuing one would have been a mutation against an already-correct, already-verified-healthy state.

## Lessons

- **Close the out-of-band gap.** Something pushed a new Rollout revision (bad readiness probe) directly against the cluster, bypassing the `bb634a3cd9c3` git-declared state. Self-heal caught it, but only after ~9 minutes of SLO burn — tighten RBAC on `Rollout`/`ReplicaSet` writes outside the GitOps path, and/or shorten Argo's self-heal detection interval for this app.
- **Don't let telemetry side-effects sit on the hot path.** `gateway` and `retriever` block on synchronous OpenLineage emission per request. A hiccup unrelated to the RAG path (rollout churn) turned into a full customer-facing latency SLO breach because lineage emission isn't fire-and-forget with a tight, non-blocking timeout/circuit breaker. Fix this independent of today's trigger — the next disruption to the lineage sink shouldn't be able to repeat this.
- **No runbook matched `SLO gateway latency — fast burn` directly.** `canary-abort.md` was the closest useful match (its Diagnose steps — `rollout_status`, `analysisrun_get`, `deploy_history` — were exactly on target) but it's keyed off `rollout-stuck`, not a latency-SLO alertname. Worth authoring a dedicated latency-fast-burn runbook that starts from `slo:gateway_latency:sli_ratio5m` and explicitly checks both rollout drift *and* `"lineage emit failed"` correlation, since this incident showed they can be two faces of the same disruption.
- **`dq_violations` freshness checks correctly reflected the outage** (continuous `inferences` freshness violations for every tenant through the bad window) — useful corroborating signal, worth surfacing alongside the SLO alert next time.

```mermaid
flowchart LR
    subgraph gitops["GitOps control plane"]
        Git["obs-gitops repo\nrevision bb634a3cd9c3"] --> ArgoCD["Argo CD Application: gateway"]
        ArgoCD -->|desired state| Rollout["Argo Rollout: gateway"]
    end

    OOB["Out-of-band Rollout mutation\nrevision 19 / hash 5785654fc7"] -.->|"drift: bypassed GitOps"| Rollout

    Rollout --> Stable["ReplicaSet dd85945b4\nstable pods (scaled 4→3)"]
    Rollout --> Canary["ReplicaSet 5785654fc7\ncanary pod p97mq"]

    Canary --> Broken[["BROKEN HOP\nreadiness probe 404, never Ready\n~9 min stuck, capacity cut"]]
    style Broken fill:#f66,stroke:#900,stroke-width:2px

    Client["Client / load-generator"] --> Stable
    Stable --> Embedder["embedder"]
    Stable --> Retriever["retriever"]
    Stable --> ModelProxy["model-proxy"]
    Retriever --> Postgres[("postgres")]

    Stable -.->|"lineage emit (sync, blocking)"| Lineage[["OpenLineage / Marquez sink"]]
    Retriever -.->|"lineage emit (sync, blocking)"| Lineage
    Lineage -.->|'\"operation timed out\" on every request'| Broken

    ArgoCD ==>|"self-heal: revert drift"| Rollout

    classDef fixed fill:#1f6f43,stroke:#0f4a2b,color:#fff
    class ArgoCD fixed
```
