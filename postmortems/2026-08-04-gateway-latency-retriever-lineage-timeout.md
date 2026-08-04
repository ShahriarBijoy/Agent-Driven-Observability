# Postmortem: gateway latency error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-04 13:20:47Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 12:27:06Z | k8s | ReplicaSet/retriever-8454db56c: SuccessfulCreate |
| 12:27:06Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 12:27:06Z | k8s | Pod/retriever-8454db56c-q2b86: Scheduled |
| 12:27:08Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:09Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:09Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:11Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:11Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:11Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:13Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:14Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:16Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:24Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:24Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:24Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:27Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:36Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:47Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:47Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:47Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:49Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:50Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:56Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:28:43Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:28:43Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:28:43Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:28:46Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:28:47Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:29:48Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:30:10Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:30:10Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:30:10Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:30:13Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:30:16Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:31:26Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:32:37Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:32:57Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:32:57Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:32:57Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:32:59Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:33:03Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:33:06Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:34:15Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:35:16Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:36:08Z | k8s | ReplicaSet/retriever-8454db56c: SuccessfulDelete |
| 12:36:08Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 13:20:10Z | alert | alert firing: SLO gateway latency — slow burn |
| 13:20:21Z | log-spike | log-spike onset: [gateway] unhandled error: 16 \| } |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785849647209%22%2C+%22to%22%3A+%221785850024820%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785849647209%22%2C+%22to%22%3A+%221785850024820%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 125/10min vs baseline 0/10min (125x baseline) — onset: [gateway] unhandled error: 16 |         } at 2026-08-04T13:20:21.314742+00:00
- error/failed log rate 125/10min vs baseline 0/10min (125x baseline) — onset: [gateway] unhandled error: 16 |         } at 2026-08-04T13:20:21.314742+00:00

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 15:20:47.852118   23400 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 15:20:47.925943   23400 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 15:20:48.015135   23400 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 15:20:47.823023   35632 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 15:20:47.907220   35632 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

Gateway latency SLO "slow burn" fired (30m & 6h windows both breaching, ~10% of the 28-day error budget in 6h). Investigation traced the extra latency to the `retriever` service, which blocks every `/v1/retrieve` call on a synchronous OpenLineage emission to Marquez that times out on effectively every request, adding 2–6 seconds to each `gateway` `POST /v1/chat` call.

## Impact

- `gateway` p95/p99 for `POST /v1/chat` inflated from a sub-second baseline to 2–6.7s per request (individual traces confirmed at 2075ms, 2898ms, 3417ms, 3439ms, 5134ms, 6714ms).
- `slo:gateway_latency:error_ratio30m` jumped from 0 to ~0.95 within one recording interval around 12:34 UTC and has stayed at 0.87–0.95 since — a sustained, not spiky, degradation, consistent with the "slow burn" classification.
- No corresponding gateway 5xx spike tied to this path (the "Malformed JSON in request body" / "unhandled error: 16" lines in gateway stderr are unrelated client-input errors, not the latency driver).

## Root cause

`retriever` logs show a continuous stream of `"lineage emit failed", "reason":"The operation timed out."` for `job:"rag.retrieve"` on essentially every retrieval, at the same timestamps as the slow spans in Tempo. A full trace (`08fffebf1f4c68307499cab030ec8cac`) shows the `POST retriever` client span alone consuming ~2.9s of a 5.1s total request — the dominant contributor to end-to-end latency, with embedder and model-proxy both sub-second in the same trace.

No deploy landed in the 6h (or 24h) window before onset (`deploy_history` returned zero entries), ruling out a bad release as the cause — this is a runtime dependency failure, not a code regression. `k8s_events` shows a `retriever` pod (`retriever-8454db56c-q2b86`) crash-looping (`BackOff`) roughly 5–10 minutes before the burn-rate metric jumped, immediately preceding the replacement pod (`retriever-dc7ddd494-*`) that has been running degraded ever since — consistent with the OpenLineage/Marquez dependency having gone unreachable around that time and the retriever's lineage-emit call being in the synchronous hot path instead of fire-and-forget. Marquez itself produced zero log lines anywhere in the cluster's log stream in the incident window, and no `up{}` series for it exists in Mimir, so its own health could not be directly confirmed — but the retriever-side timeout evidence is sufficient to name the blocking lineage call as the proximate cause of the latency SLO burn. Retriever memory usage (146Mi/512Mi limit) ruled out memory pressure/GC pauses as a contributing factor.

## What fixed it

**Nothing — remediation did not take effect.** A rolling restart of `retriever` was dry-run, approved by the operator, and attempted twice, but both execution attempts failed with `Unauthorized` from the cluster API — the same credential failure that made `kubectl_read`, `argo_app`, and `rollout_status` unavailable throughout this investigation. The restart never applied. `alert_status` was re-queried after both attempts and the alert remains **active**.

This is being reported as an **unresolved incident**: the on-call automation's write path to the cluster is not authenticated, so no remediation (restart, scale, or otherwise) could be executed. Human intervention is required to (a) restore working cluster credentials for the remediation identity, and (b) once access is restored, either restart `retriever` to see if it clears a stuck connection, or — more durably — fix `retriever` to treat OpenLineage emission as fire-and-forget with a short timeout so a downstream lineage outage can never block the request path again.

## Lessons

- The retriever's OpenLineage emit is on the synchronous request path with a timeout long enough (~3s) to blow the latency SLO on its own for every single request once Marquez is unreachable — this should be decoupled (async emit / circuit breaker / short timeout with no retry-in-line) so a lineage-system outage degrades data lineage completeness, not user-facing latency.
- The remediation identity's cluster credentials were already broken before this page (evidenced by `kube_scan`/`rollout_state`/`secret_age` all `UNAVAILABLE` in the pre-check leads) — that should itself be treated as a standing on-call capability outage and fixed proactively, not discovered mid-incident when a real fix is needed.
- No runbook matches this alert (`SLO gateway latency — slow burn`) directly; `gateway-high-error-rate.md`'s "restart the failing downstream" step was the closest applicable guidance. A dedicated runbook covering "downstream blocking on a synchronous side-channel call (lineage/audit/webhook)" would have shortened triage.

```mermaid
flowchart LR
    client[Client] -->|POST /v1/chat| gateway[gateway]
    gateway -->|POST /v1/embed ~0.5s| embedder[embedder]
    gateway -->|POST /v1/retrieve| retriever[retriever]
    gateway -->|POST /v1/complete ~0.1s| modelproxy[model-proxy]
    retriever --> postgres[(Postgres: chunks)]
    modelproxy --> postgres

    retriever -.blocking OpenLineage emit,\nThe operation timed out, ~2.9s added per call.-> marquez[(Marquez / OpenLineage — unreachable)]

    style retriever fill:#ff6b6b,stroke:#900,stroke-width:3px,color:#000
    style marquez fill:#ffb3b3,stroke:#900,stroke-width:2px,color:#000
    linkStyle 4 stroke:#ff0000,stroke-width:3px
```
