# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-04 00:12:46Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 00:12:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 00:12:25Z | log-spike | log-spike onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"f2ad8c466355ad348e3bb6c473ed62b5","span_id":"f40f0ec55c64f2ca","time":"2026-08-04T00:12:25.215Z","reason":"The operation timed out.","job":"r… |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785802366553%22%2C+%22to%22%3A+%221785802954298%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785802366553%22%2C+%22to%22%3A+%221785802954298%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"f2ad8c466355ad348e3bb6c473ed62b5","span_id":"f40f0ec55c64f2ca","time":"2026-08-04T00:12:25.215Z","reason":"The operation timed out.","job":"rag.embed","eventType":"START"} at 2026-08-04T00:12:25.216004+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"f2ad8c466355ad348e3bb6c473ed6… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 02:12:47.985617    5388 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 02:12:48.201732    5388 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 02:12:48.497494    5388 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 02:12:47.979378   24752 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 02:12:48.199377   24752 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

The `SLO gateway latency — fast burn` alert fired for tenant acme. Gateway's 5-minute latency SLI (good-request ratio) collapsed from 100% to a sustained ~5% almost immediately after every RAG-path lineage-emission call (`gateway`, `retriever`, and `embedder` all log `"lineage emit failed"`, `reason: "The operation timed out."`, for both `rag.embed`/`rag.retrieve`/`rag.inference` START and COMPLETE events) began timing out. This is not a bad code deploy: `deploy_history` showed nothing in the preceding 60 minutes, and the one rollout that did occur during the incident window redeployed the identical commit already on `main` (`gitea_compare main...10f24bc` returned zero commits/zero file diff).

## Impact

- gateway p95 latency to embedder and retriever jumped from a ~1.5–2.7s baseline to a stable ~6.2s plateau at the same moment; model-proxy (the LLM call, uninvolved in lineage emission) stayed flat at ~0.33–0.37s the whole time — the clean control that isolates the fault to the lineage-emit path, not the model backend.
- End-to-end `POST /v1/chat` traces during the incident ran 14–17s, with individual embedder/retriever/gateway spans each burning several seconds waiting on the lineage-emit timeout.
- `slo:gateway_latency:sli_ratio5m` cratered from 1.0 to 0.25 to ~0.05–0.07 within about 3 minutes of the first timeout burst, and stayed there for the rest of the observed window — a fast burn of the 28-day error budget exactly as the alert describes.
- Independently, a Rollout to gateway revision 13 (same image `10f24bc`, no code change) began during the incident and has been stuck in `CrashLoopBackOff` (repeated `BackOff` events, no OOMKilled/Unhealthy events, memory usage on other pods stayed in the 90–125MiB range with no spike) — this reduced available stable capacity but started well after the SLI had already cratered, so it is a compounding effect, not the trigger.

## Root cause

A downstream dependency failure: the OpenLineage/Marquez lineage sink stopped responding to lineage-emit calls made synchronously in the RAG request hot path (embed → retrieve → inference). Every one of those calls now blocks until a client-side timeout, adding several seconds of latency to essentially every gateway request and blowing the gateway latency SLO. No corresponding CPU throttling or memory pressure was observed on gateway/retriever/embedder, and no CI build or app-code change landed near the onset, ruling out a bad deploy or resource exhaustion as the cause.

```mermaid
flowchart LR
    client[Client] -->|POST /v1/chat| gateway[gateway]
    gateway --> retriever[retriever]
    gateway --> embedder[embedder]
    gateway --> modelproxy[model-proxy]
    modelproxy --> llm[(mock-llm)]
    gateway -. lineage emit\nrag.inference .-> marquez
    retriever -. lineage emit\nrag.retrieve .-> marquez
    embedder -. lineage emit\nrag.embed .-> marquez
    marquez[["Marquez / OpenLineage\n(BROKEN HOP)\nevery emit call times out,\nblocks the request thread"]]

    canary["gateway rev 13 canary\n(same commit, CrashLoopBackOff\nsince 00:15:50 — compounding,\nnot triggering"]

    style marquez fill:#7a1f1f,stroke:#ff4d4d,stroke-width:3px,color:#fff
    style canary fill:#3a2a55,stroke:#a78bfa,stroke-width:2px,color:#fff
```

## What fixed it

Diagnosis pointed to two independent, tool-addressable actions: (1) the underlying Marquez/lineage-sink outage is outside the scope of the available remediation tools (no lineage/Marquez workload target exists to restart or patch), so it could not be fixed directly; (2) the stuck gateway canary (revision 13) was a legitimate, evidenced, tool-actionable cleanup target — same commit as stable, crash-looping with no OOM/Unhealthy signal, purely consuming capacity. A `rollout_abort` on gateway was dry-run, approved by the operator (summary + verified diff attached via the dry-run action_id), and then executed with `dry_run=false` — but the execution call itself failed with a Kubernetes API authorization error (`"You must be logged in to the server (Unauthorized)"`), the same failure mode the pre-check leads had already flagged as unavailable for `kube_scan`, `rollout_state`, and `secret_age` before this investigation began. A second attempt failed identically. Re-querying `alert_status` afterward confirmed the alert is still active, unchanged since it first fired — **the remediation did not take effect and the incident is not resolved.**

## Lessons

- The RAG pipeline's OpenLineage emission is synchronous and on the critical request path with no circuit breaker or async/fire-and-forget guard — a single unresponsive lineage sink degrades every user-facing request instead of just lineage completeness. This should be made non-blocking (background emit with a short, non-request-blocking timeout, or a queue) so a lineage-sink outage can never burn the gateway latency SLO again.
- The cluster's remediation credentials were unauthorized for the entire duration of this incident (confirmed by pre-check leads and reproduced twice live), which blocked even a well-evidenced, approved, low-risk cleanup action (aborting a redundant crash-looping canary). This is an operational blind spot: remediation tooling should alert on its own auth health independently of the incidents it's meant to fix.
- Next steps for a human operator: (a) restore the agent-remediate / kubectl credential used by these tools, re-run the approved `rollout_abort` on gateway; (b) directly investigate/restart the Marquez deployment (out of this toolset's reach) to clear the lineage-emit timeouts, which is the actual fix for the SLO burn; (c) once fixed, consider making lineage emission non-blocking as a permanent guard.
