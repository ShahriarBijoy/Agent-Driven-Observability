# Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-13 19:47:42Z
- **Resolved:** 2026-08-13 19:57:42Z

## Timeline (machine-generated)

All times UTC on 2026-08-13 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 19:44:03Z | log-spike | log-spike onset: [gateway] unhandled error: 16 \| } |
| 19:47:10Z | alert | alert firing: SLO gateway availability — fast burn |
| 19:48:06Z | k8s | ReplicaSet/retriever-65c474b46b: SuccessfulCreate |
| 19:48:06Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 19:48:06Z | k8s | Pod/retriever-65c474b46b-bqqd9: Scheduled |
| 19:48:07Z | k8s | Pod/retriever-65c474b46b-bqqd9: Started |
| 19:48:07Z | k8s | Pod/retriever-65c474b46b-bqqd9: Pulled |
| 19:48:07Z | k8s | Pod/retriever-65c474b46b-bqqd9: Created |
| 19:48:15Z | k8s | Pod/retriever-d6d55bf7f-wfrd6: Killing |
| 19:48:15Z | k8s | ReplicaSet/retriever-d6d55bf7f: SuccessfulDelete |
| 19:48:15Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 19:54:10Z | alert | alert resolved: SLO gateway availability — fast burn |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786650462914%22%2C+%22to%22%3A+%221786651062850%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221786650462914%22%2C+%22to%22%3A+%221786651062850%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match (2):** `gateway-high-error-rate.md`, `stale-secret.md` — toolset narrowed to 14 tools: alert_status, deploy_history, k8s_events, kubectl_read, loki_query, mimir_query, publish_postmortem, request_approval, restart_workload, runbook_lookup, runbook_read, save_artifact, tempo_query, update_db_secret

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
1 deploy-window lead
- argo app platform: sync=OutOfSync health=Healthy (revision c025382ba170)

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: [gateway] unhandled error: 16 |         } at 2026-08-13T19:44:03.399220+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: [gateway] unhandled error: 16 |         } at 2026-08-13T19:44:03.399220+00:00

### attribution — LEAD
errors concentrate on gateway (24.0%); time concentrates in gateway's own handler (~4.7s of 7.5s) over the last 10m — which is not necessarily the workload named on the alert:
- gateway: 24.0% of its OWN responses are 5xx (10m)
- retriever: 21.1% of its OWN responses are 5xx (10m)
- model-proxy: 2.6% of its OWN responses are 5xx (10m)
- gateway → POST retriever: 22.4% of those outbound calls failed
- gateway → POST model-proxy: 12.8% of those outbound calls failed
- own-handler p95 (server p95 minus its slowest outbound call — a ranking, not a measurement): gateway ~4.7s of 7.5s end to end, embedder ~2.7s of 2.7s end to end, retriever ~2.5s of 2.5s end to end
- gateway → POST embedder: p95 2.8s outbound
- gateway → POST retriever: p95 2.5s outbound

### kube_scan — OK
all pods Ready, no notable cluster events

### rollout_state — OK
gateway and model-proxy rollouts stable, no failed analysis

### secret_age — OK
Secret subject-db-credentials last modified 19d 20h ago (created 19d 20h ago).

</details>

## Narrative

## Summary

The gateway availability fast-burn SLO alert fired because a sudden, system-wide traffic surge overwhelmed the retriever service, which was running a single replica while its peers (gateway, model-proxy) each ran four. Gateway's error-handling path surfaced retriever's downstream failures as its own unhandled errors, driving gateway's 5xx rate high enough to breach both the 5-minute and 1-hour burn-rate windows.

## Impact

At peak, gateway's own 5xx rate rose to roughly 23% (from a near-zero baseline), retriever independently failed ~20% of its own requests (almost entirely 503s), and the gateway→retriever call edge failed ~22% of the time. model-proxy showed an elevated 429 rate consistent with its existing per-tenant rate limiting (seen against the `abuser` tenant in gateway logs) plus a small bump in 500s — a side effect of the same load, not a separate fault. Request volume across gateway, model-proxy, and retriever rose in lockstep roughly 13–56x above their flat baselines (retriever 0.3→~17 rps, gateway 1.2→~19 rps, model-proxy 1.2→~15 rps), all beginning at the same instant — see the attached `report.html` chart of retriever's request rate.

## Root cause

Ruled out first, per the matched runbooks: no subject-service deploy landed in the incident window (`deploy_history` showed only unrelated `web`-app PR merges, nothing touching gateway/retriever/model-proxy); zero `"password authentication failed"` log lines, so the `secret_age` lead (secret rotated 19d 20h ago) does not lead any auth-failure onset and the stale-secret hypothesis is out; no OOMKilled or warning-level k8s events, and retriever's memory stayed well under its 512Mi limit (~90–130Mi) throughout, ruling out a memory story.

Confirmed root cause: retriever's own request-rate metric was flat at 0.3 rps for the entire pre-incident lookback, then climbed sharply and simultaneously with gateway's and model-proxy's own traffic — a genuine, system-wide load surge, not an isolated retriever fault. But retriever was provisioned at a single replica versus four each for gateway and model-proxy. Unable to keep pace, it began shedding load, returning 503s on ~20% of its own traffic. The gateway→retriever client-span error rate matched almost exactly (~22.4%), and gateway's own logs show a repeating `[gateway] unhandled error` line firing in lockstep with the surge — gateway does not degrade gracefully when its call to retriever fails, and instead throws, which gets attributed as a gateway-owned 5xx. That gateway-side amplification is what actually breached the SLO burn-rate windows. This matches the runbook's first candidate hypothesis exactly: a downstream (retriever) failing under load, with gateway only surfacing it. The concurrent model-proxy 429s are ordinary rate limiting and not part of the causal chain.

```mermaid
flowchart LR
    Client(["client"]) -->|"POST /v1/chat"| Gateway["gateway (4 replicas)"]
    Gateway -->|"POST embedder"| Embedder["embedder (1 replica)"]
    Gateway -->|"POST model-proxy"| ModelProxy["model-proxy (4 replicas)"]
    Gateway -->|"POST retriever"| Retriever["retriever (1 replica) ‼ BROKEN HOP"]
    Retriever --> PG[("postgres/pgvector")]
    ModelProxy -.->|"429s: per-tenant rate limit (expected, not causal)"| Gateway
    Retriever -.->|"503s ~20% of own traffic:\nsingle replica saturated by ~56x surge"| Gateway
    Gateway -.->|"unhandled error → gateway-owned 5xx,\nbreaches SLO fast-burn"| Client

    style Retriever fill:#ff4d4d,stroke:#7a0000,stroke-width:3px,color:#fff
    style Gateway fill:#ffd166,stroke:#7a5200,stroke-width:2px
```

## What fixed it

I diagnosed retriever as the failing dependency, dry-ran a `restart_workload` against it (rolling restart, no spec change), and requested operator approval referencing that dry-run's action_id, as the runbook's "downstream wedged → restart it" mitigation prescribes. **The operator denied the request.** Per protocol I did not execute the restart and did not retry.

Independently of that denial, a re-query of `alert_status` came back resolved: retriever's own 5xx rate had already fallen to 0%, the gateway→retriever error edge to ~1.8%, and all three services' request volume had returned to pre-incident baseline (gateway back to ~1.2 rps at 0% 5xx). The k8s event stream shows retriever's pod was independently recycled (a new `retriever-*` pod replaced the prior one) around the same time the pre-check-flagged `platform` Argo app — reported OutOfSync — would have reconciled, plus the traffic surge itself receding. **This was not a remediation I performed, nor one that was approved.** The underlying capacity mismatch (retriever at 1 replica against gateway/model-proxy's 4) was never actually corrected and remains fully in place.

## Lessons

- Retriever's replica count should scale with (or be set proportional to) gateway/model-proxy's, not sit at a single instance while its callers run 4x that count — this is an unremediated latent risk, not a closed issue.
- Gateway's handling of a failing/slow retriever call should degrade gracefully (retry/backoff/circuit-break) instead of throwing an unhandled exception that gets counted as a gateway-owned 5xx — today a retriever capacity problem manufactures a gateway incident.
- The `secret_age` and `recent_deploys` pre-check leads were both red herrings here; each matched runbook's own diagnostic steps (rotation-vs-failure ordering, deploy-window check) ruled them out quickly and correctly — that discipline is worth keeping.
- An incident that "recovers on its own" while the actual proposed fix was denied is not durably resolved: the same traffic pattern tomorrow hits the same single-replica retriever. File this as a follow-up capacity change (scale retriever ≥ 4 replicas, or add autoscaling) rather than treating it as closed.
