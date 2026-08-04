# Postmortem: gateway latency error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-03 22:14:47Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:14:10Z | alert | alert firing: SLO gateway latency — slow burn |
| 22:14:41Z | log-spike | log-spike onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"d98638a4a998e7583fe26d32675976b6","span_id":"be03d42b7e1c0372","time":"2026-08-03T22:14:41.892Z","reason":"The operation timed out.","job":"ra… |
| 22:15:40Z | k8s | Rollout/gateway: RolloutUpdated |
| 22:15:40Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 22:15:40Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 22:15:41Z | k8s | Pod/gateway-dd85945b4-rhws5: Killing |
| 22:15:41Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 22:15:41Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 22:15:42Z | k8s | ReplicaSet/gateway-55bbf6bfbf: SuccessfulCreate |
| 22:15:42Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 22:15:42Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Scheduled |
| 22:15:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:15:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:15:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:15:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:15:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:15:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:15:50Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:15:51Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:15:53Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:00Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:16:00Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:16:00Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:16:02Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:03Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:04Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:28Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:16:28Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:16:28Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:16:30Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:33Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:17:19Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:17:19Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:17:19Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:17:21Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:17:22Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:17:23Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:30Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:18:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:18:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:18:47Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:53Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785795287309%22%2C+%22to%22%3A+%221785795560819%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785795287309%22%2C+%22to%22%3A+%221785795560819%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 126/10min vs baseline 0/10min (126x baseline) — onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"d98638a4a998e7583fe26d32675976b6","span_id":"be03d42b7e1c0372","time":"2026-08-03T22:14:41.892Z","reason":"The operation timed out.","job":"rag.inference","eventType":"START"} at 2026-08-03T22:14:41.892764+00:00
- error/failed log rate 126/10min vs baseline 0/10min (126x baseline) — onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"d98638a4a998e7583fe26d32675976… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 00:14:48.726666   31320 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 00:14:48.966579   31320 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 00:14:49.098274   31320 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 00:14:48.817098   22924 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 00:14:49.037447   22924 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
`SLO gateway latency — slow burn` fired (sev2, tenant acme): the gateway's p95 latency error budget was burning at ~10x over a 30m/6h dual window. No deploy preceded the alert (deploy_history: 0 entries in 60m/360m; latest Gitea CI runs on `main` — `d62500f603`, `28686bc2ba`, `283cec4c08` — touch load-generator and model-proxy pre-warm code, unrelated), and there were no OOMKills, restarts, or memory pressure (container_memory_working_set_bytes flat at ~100-130MiB across all gateway/embedder/model-proxy pods). No runbook matched this exact alertname, so this was worked from telemetry alone.

## Impact
Intermittent multi-second latency bursts on `POST /v1/chat` (and downstream `/v1/embed`, `/v1/retrieve`) across at least two windows in the last 6h. Sampled traces show whole requests taking 3.7s–7.3s (e.g. trace `114f0be6...` 3730ms, `0ea6212a...` 6725ms, `b2813212...` 6786ms), driven by individual spans stuck for 1–3.4s each. The gateway p95 span latency (`histogram_quantile(0.95, traces_spanmetrics_latency_bucket{service="gateway"})`) sat at a flat ~0.0019s baseline for hours, then jumped to double-digit values and repeatedly pegged the 16.384s bucket ceiling during burst windows — one ~2h before the page, and a second beginning right at alert onset and still active at last check.

## Root cause
Every `rag.inference` (gateway), `rag.retrieve` (retriever), and `rag.embed` (embedder) span wraps a synchronous OpenLineage emit call to the lineage backend (Marquez). During the burst windows, that emit call is timing out (`"message":"lineage emit failed","reason":"The operation timed out."`, logged at warn level across gateway, retriever, and embedder simultaneously, on every pod, hundreds of times in a 10-minute window vs a 0-baseline) — and because the emit is awaited in-line on the request path rather than fired-and-forgotten, each timeout adds its full duration directly onto client-facing latency. With gateway calling into retriever and embedder (each independently paying their own lineage-timeout tax) inside a single `/v1/chat` request, the delays compound, which is exactly why total request time (3.7–7.3s) is a multiple of any single span's stall. This is a downstream-dependency/application-design issue, not a resource, deploy, or node problem: memory is flat, no k8s events fired, and no code shipped in the alert window.

## What fixed it
Diagnosis was thorough but remediation did not complete. A rolling restart of `gateway` was dry-run (action `3f120cc1a95935ff`, diff: `restartedAt` annotation bump, no spec change), the operator approved it (`apr_19fc9b4957918b`), but the real execution failed twice with the identical `Unauthorized` cluster-credential error already surfaced by the pre-check as `kube_scan`/`rollout_state: UNAVAILABLE` — this session's kubeconfig cannot authenticate for write operations against this cluster right now. Re-querying `alert_status` afterward shows the alert still `active`, confirming no recovery. Worth noting even a successful restart would only have cleared in-flight request backlog on gateway — it would not have fixed the underlying issue, since retriever and embedder independently hit the same lineage-timeout pattern and the lineage backend itself is untouched by a gateway restart.

## Lessons
1. **Recovery not achieved.** This incident is closing (or not) purely on the server-side `alert_status` signal — as observed here, it remained active after our only remediation attempt failed at the execution step.
2. Fix belongs in code, not infra: make the OpenLineage emit in `rag.inference` / `rag.retrieve` / `rag.embed` fire-and-forget (or wrap it with a short timeout + circuit breaker) so a slow/unreachable Marquez cannot add seconds to user-facing latency.
3. Separately, investigate why the lineage backend (Marquez) itself is timing out — it was not directly inspectable with the tools available in this session (no Marquez logs found in Loki under `subject` namespace, no metrics matching `.*lineage.*` in Mimir).
4. The cluster write-credential failure (`Unauthorized` on `restart_workload`, matching the pre-check's `kube_scan`/`rollout_state` failures) needs its own follow-up — on-call had no working mutating lever this session, which should not be treated as normal.
5. No runbook exists for `SLO gateway latency — slow burn`; one should be authored covering: check `traces_spanmetrics_latency_bucket` per-service p95, check for `lineage emit failed` warn logs across gateway/retriever/embedder, and treat lineage/OpenLineage emission as a suspect for hot-path latency, not just data-quality freshness.

```mermaid
flowchart LR
    client([client]) --> gateway[gateway]
    gateway -->|POST /v1/embed| embedder[embedder]
    gateway -->|POST /v1/retrieve| retriever[retriever]
    gateway --> modelproxy[model-proxy]
    retriever --> postgres[(postgres)]
    gateway -. rag.inference lineage emit .-> marquez{{Marquez / lineage backend}}
    embedder -. rag.embed lineage emit .-> marquez
    retriever -. rag.retrieve lineage emit .-> marquez

    style marquez fill:#5c1a1a,stroke:#ff6b6b,stroke-width:2px,color:#fff
    linkStyle 5 stroke:#ff6b6b,stroke-width:3px
    linkStyle 6 stroke:#ff6b6b,stroke-width:3px
    linkStyle 7 stroke:#ff6b6b,stroke-width:3px

    classDef broken fill:#5c1a1a,stroke:#ff6b6b,color:#fff;
```
**Broken hop:** the dashed synchronous lineage-emit calls from gateway/retriever/embedder into Marquez — each one blocks its request span until it times out, and because all three hops pay this tax independently within one `/v1/chat` call, the delays stack into the multi-second end-to-end latency that burned the SLO budget.
