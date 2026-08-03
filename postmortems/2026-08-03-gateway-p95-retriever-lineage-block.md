# Postmortem: gateway p95 latency above 2s

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 02:38:41Z
- **Resolved:** 2026-08-03 02:43:41Z

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 02:38:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 02:39:10Z | alert | alert resolved: Gateway p95 latency > 2s |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785724721496%22%2C+%22to%22%3A+%221785725021325%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785724721496%22%2C+%22to%22%3A+%221785725021325%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — OK
error/failed log rate normal: 200/10min vs baseline 500/10min

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 04:38:43.302960   23084 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:38:43.437639   23084 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:38:43.561018   23084 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 04:38:43.243755   24912 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:38:43.344550   24912 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

Gateway p95 latency breached the 2s SLO (sev1). Root-caused to the retriever service, whose single replica blocks every `/v1/retrieve` call on a synchronous OpenLineage emit to Marquez that is now timing out on nearly every request. Two remediation attempts (scale-out, then rolling restart) were both blocked by a cluster-credential failure and could not be executed. The incident was **not** confirmed recovered.

## Impact

Every `/v1/chat` request through `gateway` routed through the single `retriever` replica saw multi-second added latency; Mimir shows gateway `/v1/chat` p95 sustained at the histogram's 10s bucket ceiling for an extended stretch of the window, dropping only during a traffic gap, and still sitting around 4.7s and rising at the last sample taken. Tempo traces show `retriever` returning HTTP 500 to `gateway` on a large share of requests (`exception.message: "retriever returned 500"`), and Postgres `dq_violations` shows `freshness` checks failing on the `inferences` dataset for every tenant (acme, bravo, abuser) continuously through the window — confirming the RAG write path stalled in step with the latency spike, not just the read path.

## Root cause

`retriever` logs show a repeating warning on essentially every `rag.retrieve` job: `"lineage emit failed", reason: "The operation timed out."` — the same warning appears on `gateway`'s `rag.inference` job. The emit call sits inside the request-handling path (not fire-and-forget): the retriever's own `/v1/retrieve` request duration tracks the lineage-emit wait almost exactly in Tempo, and Mimir's `request_duration_seconds` histogram for `retriever{http_route="/v1/retrieve"}` shows p95 rising and falling in lockstep with request rate — climbing to the 10s cap as traffic rose to ~5-6 req/s and easing only as traffic eased. `retriever` runs a single replica (`count(active_requests{job="retriever"})` = 1), so concurrent gateway requests serialize behind each other's blocking lineage-emit wait — a classic queueing signature layered on top of a degraded dependency, not a CPU/memory problem (kube_scan/`top` was unavailable, but Loki shows no OOM or crash-loop events for retriever).

`deploy_history` shows no deploy to `gateway`, `retriever`, or `platform` inside the alert window — the last gitops deploy (`bb634a3`) landed roughly three hours earlier, and the two same-day CI merges (`283cec4c08`, `d62500f603`) touch `model-proxy` warmup and `load-generator` percentile code, neither on the gateway→retriever→lineage path. A bad deploy is ruled out by evidence, not assumption.

## What fixed it

Nothing — both remediation attempts failed. `scale_deployment(retriever, 3)` dry-run succeeded (though it could not read the live replica count) but the real apply (`dry_run=false`) failed with `You must be logged in to the server (Unauthorized)`. The fallback, `restart_workload(retriever)`, dry-ran cleanly but its real apply failed with the identical `Unauthorized` error. This matches the pre-check leads for this incident, which already reported `kube_scan`, `rollout_state`, and `secret_age` as unavailable for the same reason — the cluster-mutating credential for this session was broken end-to-end, not just for reads. No remediation tool in the on-call kit could reach the cluster. Re-querying Mimir directly (not just `alert_status`, which flapped to inactive mid-investigation without the underlying p95 series ever sustaining a drop below 2s) confirms gateway p95 was still elevated (~4.7s, trending up) at the last sample taken. **Recovery is not confirmed — this incident is being closed unresolved from the automation side and needs a human with working cluster credentials to scale or restart `retriever`, and separately to fix the synchronous lineage-emit call and add retriever replicas as a durable fix.**

## Lessons

- Lineage emission (OpenLineage → Marquez) must not block the user-facing request path. It should be fire-and-forget or wrapped in a short bounded timeout with a circuit breaker, so a slow/unavailable lineage sink degrades observability, not serving latency.
- `retriever` had zero redundancy (1 replica) in front of live traffic. A single blocked replica turns any downstream slowness directly into gateway-wide latency.
- The on-call remediation identity was silently unusable for every cluster-mutating action this session (scale, restart alike). Credential health for the remediation path should itself be an alerting signal — an on-call agent that can diagnose but never act is a worse failure mode than a slow page, because it looks like progress until the very last step.
- No runbook matched `Gateway p95 latency > 2s` — one should be authored covering: check Tempo for the slowest downstream hop, check Mimir per-hop `request_duration_seconds` by route, check for blocking calls to auxiliary systems (lineage, audit, cache-warm) that aren't on the critical path by design.

```mermaid
flowchart LR
    Client -->|POST /v1/chat| Gateway
    Gateway -->|POST /v1/embed| Embedder
    Gateway -->|POST /v1/retrieve| Retriever
    Retriever -->|SELECT chunks| Postgres[(Postgres: chunks)]
    Gateway -->|completion| ModelProxy[model-proxy]
    Retriever -. blocking lineage.emit .-> Marquez[[Marquez / OpenLineage]]
    Gateway -. blocking lineage.emit .-> Marquez

    class Retriever,Marquez broken;
    style Retriever fill:#4a1414,stroke:#ff4d4d,stroke-width:3px,color:#fff
    style Marquez fill:#4a1414,stroke:#ff4d4d,stroke-width:3px,color:#fff
    linkStyle 4 stroke:#ff4d4d,stroke-width:3px
    linkStyle 5 stroke:#ff4d4d,stroke-width:3px

    Retriever -.->|"ROOT CAUSE: sync lineage.emit\ntimes out on ~every request,\nsingle replica serializes\nconcurrent /v1/chat behind it"| Marquez
```
