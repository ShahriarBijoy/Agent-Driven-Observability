# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 02:52:46Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 02:52:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 02:52:21Z | log-spike | log-spike onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"728f5860db1907a8193e15b7146a1365","span_id":"93ca452b085d9505","time":"2026-08-03T02:52:21.623Z","reason":"The operation timed out.","job":"… |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785725566204%22%2C+%22to%22%3A+%221785725998927%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785725566204%22%2C+%22to%22%3A+%221785725998927%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"728f5860db1907a8193e15b7146a1365","span_id":"93ca452b085d9505","time":"2026-08-03T02:52:21.623Z","reason":"The operation timed out.","job":"rag.retrieve","eventType":"FAIL"} at 2026-08-03T02:52:21.623896+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"728f5860db1907a8193e15b7146a… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 04:53:08.175514   50164 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:53:08.691304   50164 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:53:10.412688   50164 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 04:53:08.602472   35880 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:53:10.279065   35880 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
`SLO gateway latency — fast burn` fired for tenant acme. Root cause: the `retriever` pod has been unable to authenticate to Postgres for the entire incident window, so every `/v1/chat` request stalls for 9–18 seconds (embedder call + retriever retry/backoff) before failing with a 502. No runbook matched this alertname directly; the closest candidate (`stale-secret.md`, scoped to `slo-avail-fast`/`gw-5xx`) was consulted and its diagnostic steps were followed even though this alert is latency-shaped rather than availability-shaped.

## Impact
Tenant acme chat completions degraded from a healthy path to 9.7s–18.2s end-to-end latency on essentially every request during the window (sampled Tempo traces below), most ending in gateway 502s after the retriever call errored. Retrieval-dependent requests (non-cached) were effectively unusable.

## Root cause
Postgres itself logs, server-side: `FATAL: password authentication failed for user "lab"` (SQLSTATE `28P01`), starting in the same second the alert's evaluation window opened. The retriever's own query logs show the identical `PostgresError: password authentication failed for user "lab"` on every `chunks` vector-search query (`select ... from chunks order by 1 - (embedding <=> $1) ...`). An independent admin connection to the same Postgres instance succeeds and `select count(*) from chunks` returns 991 rows — so Postgres and the data are healthy; only the retriever's presented credential is being rejected.

Ruled out:
- **Bad deploy**: `deploy_history` shows no deploy/gitops sync in the 60 minutes before onset (last gitops deploy was gateway at 23:32, ~3h earlier); no CI run touches the retriever's DB code path.
- **Pod crash/restart**: `kube_pod_start_time` shows the retriever pod has been running ~4h44m with zero container restarts — it did not just come up with a bad env; it was working, then started failing mid-life.
- **Chaos/log noise red herring**: the `"lineage emit failed" / operation timed out` warnings present on gateway, retriever, and embedder alike are a decorative side-channel (Marquez lineage emission) that fires uniformly regardless of the real failure and were not used as evidence.

This is the classic "credential rotated underneath a long-lived pod" signature — except `update_db_secret`'s dry run reports **no pending rotation in the vault**, meaning the Kubernetes Secret is already the correct/current value; the retriever process simply hasn't restarted to pick it up.

## What fixed it
A rolling restart of `deployment/retriever` (`restart_workload`, dry-run diff: `spec.template annotation kubectl.kubernetes.io/restartedAt` bump, no spec change) was proposed, dry-run validated, and **approved by the operator**. Execution (`dry_run=false`) was attempted three times and failed every time with `error: You must be logged in to the server (Unauthorized)` against the cluster API — the identical failure already visible in this incident's pre-check leads (`kube_scan`, `rollout_state`, and `secret_age` were all `UNAVAILABLE` for the same reason before investigation even started). This is a cluster-credential/RBAC outage in the remediation path itself, unrelated to the diagnosed root cause, and it blocked the approved fix from landing. **The alert remains ACTIVE — this incident did not recover in this session.**

## Lessons
- The remediation identity (agent-ro / agent-remediate kubeconfig) lost cluster API access — read *and* write — for the duration of this incident. That needs its own health check/alert so on-call doesn't discover a broken remediation path only after getting an approval and trying to act on it.
- No runbook currently matches the `SLO gateway latency — fast burn` alertname. The `stale-secret.md` runbook's signature (password-auth failures, no deploy in window, pods pre-dating rotation) applied cleanly here even though its documented triggers are availability/error-rate alerts, not a latency-burn alert — worth adding this alertname to its trigger list, since retry/backoff against auth failures burns a *latency* budget just as surely as it burns an availability budget.
- Next on-call with restored cluster credentials: re-run `restart_workload(workload="retriever")` — dry-run first (a fresh approval is required since the prior approval was single-use), then verify `alert_status` clears and `PostgresError` stops appearing in retriever logs.

```mermaid
flowchart LR
  Client["Client"] -->|"POST /v1/chat"| Gateway["gateway"]
  Gateway -->|"POST /v1/embed (ok)"| Embedder["embedder"]
  Gateway -->|"POST /v1/retrieve"| Retriever["retriever"]
  Retriever -.->|"❌ FATAL: password authentication failed\nuser \"lab\" (28P01) — BROKEN HOP"| Postgres[("Postgres\nchunks table")]
  Retriever -->|"500"| Gateway
  Gateway -->|"502, 9-18s"| Client
  Gateway -.->|"unaffected"| ModelProxy["model-proxy"]

  style Retriever fill:#3a1414,stroke:#e5484d,stroke-width:2px
  style Postgres fill:#3a1414,stroke:#e5484d,stroke-width:2px
```
