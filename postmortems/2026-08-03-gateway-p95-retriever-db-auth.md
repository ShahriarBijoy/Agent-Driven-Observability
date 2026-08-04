# Postmortem: gateway p95 latency above 2s

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 01:23:41Z
- **Resolved:** 2026-08-03 01:28:41Z

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 01:19:00Z | log-spike | log-spike onset: 2026-08-03 01:19:00.755 UTC [1704332] FATAL: password authentication failed for user "lab" |
| 01:23:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 01:24:10Z | alert | alert resolved: Gateway p95 latency > 2s |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785720221466%22%2C+%22to%22%3A+%221785720521526%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785720221466%22%2C+%22to%22%3A+%221785720521526%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: 2026-08-03 01:19:00.755 UTC [1704332] FATAL:  password authentication failed for user "lab" at 2026-08-03T01:19:00.756094+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: 2026-08-03 01:19:00.755 UTC [1704332] FATAL:  password authentication failed for user "lab" at 2026-08-03T01:1… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 03:23:42.092420   65068 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 03:23:42.223428   65068 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 03:23:42.378838   65068 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 03:23:42.004386   55816 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 03:23:42.130363   55816 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
Gateway p95 latency for `POST /v1/chat` breached the 2s SLO, sustaining ~13–15s (and, for several minutes, going fully unmeasurable as requests stopped completing at all). Root cause: the `retriever` service could not authenticate to Postgres as role `lab`, and its client-side retry loop against the DB burned enough wall-clock time per request to blow through the gateway's request budget.

## Impact
Every `/v1/chat` call routing through the RAG path (`rag.retrieve` → retriever → postgres) stalled for seconds to tens of seconds; individual traces were observed as slow as 34s. `traces_spanmetrics` shows 37 errored client spans from gateway to retriever and 119 errored `rag.chat` spans. The `inferences` table logged zero completed rows for the trailing hour, so tenant `acme` traffic on this path was effectively degraded/blocked, not just slow.

## Root cause
Postgres began rejecting the `lab` role's password at 01:19:01 UTC (`FATAL: password authentication failed for user "lab"`, repeated continuously in both the `postgres` and `retriever` containers, same pod `retriever-dc7ddd494-jv9j7` throughout). `deploy_history` shows no deploy to gateway, retriever, or platform in the hour before onset (nearest gitops deploy was ~1h47m prior, at 23:32 UTC, and is the gateway canary/rollback visible in k8s events — a red herring that predates and is unrelated to this failure). Checking `update_db_secret` (dry-run) showed **no rotated credential pending in the vault** — i.e. the vault and the in-cluster Secret already agree on the current, correct password. That rules out an in-flight rotation as the trigger and points instead to the long-running `retriever` pod holding a stale credential in its process environment from before whatever correction landed in the Secret — Kubernetes never restarts a pod just because a referenced Secret's value changed underneath it, so the pod kept authenticating with its originally-injected (now-wrong) value on every connection attempt, retrying rapidly and burning seconds per request.

## What fixed it
A rolling restart of `deployment/retriever` was dry-run, diffed (`kubectl.kubernetes.io/restartedAt` annotation patch, no spec change), and approved by the operator. However, **both live executions of `restart_workload` (dry_run=false) failed with a cluster authorization error** ("You must be logged in to the server (Unauthorized)") — the same failure mode already flagged as unavailable by this incident's `kube_scan`, `secret_age`, and `rollout_state` pre-checks. The remediation was therefore approved but **not confirmed applied** by this agent. `alert_status` subsequently reported the alert resolved on repeated re-query, but our own telemetry re-check at the same time still showed continuous `password authentication failed` log lines (as recent as 01:29:12 UTC) and gateway p95 still at ~14s — directly contradicting a genuine fix. This discrepancy should be treated as unresolved pending human confirmation that retriever was actually restarted (by some path other than this agent) and that Postgres auth is genuinely clean.

## Lessons
- Cluster write (and even read) access for the on-call agent was degraded for this entire incident — `kube_scan`, `secret_age`, `rollout_state`, and finally the live `restart_workload` call all hit the same "must be logged in" error. This is an operational gap that needs fixing independent of this incident: on-call remediation is worthless if the credential it runs under is broken.
- `alert_status` flipping to resolved should not be trusted blindly when it disagrees with directly re-queried telemetry (p95 latency, raw auth-failure logs) from the same window — a stale/flapping alert evaluation can look like recovery. Always cross-check the underlying signal, not just the alert state, before declaring victory.
- Add a runbook (or extend `stale-secret.md`) for the case where the vault/Secret are already correct but a long-lived pod is holding a cached, now-wrong credential — the existing `stale-secret.md` assumes `update_db_secret` will find something to sync, but this incident shows that leg can be a no-op while the real fix is still "restart the pod that's holding the old value."
- Consider an app-level circuit breaker/backoff cap for retriever's Postgres client so a persistent auth failure fails fast (5xx) instead of retrying for 10+ seconds per request and dragging gateway p95 down with it.

```mermaid
flowchart LR
  client[Client] --> gateway[gateway\nPOST /v1/chat]
  gateway --> embedder[embedder]
  gateway --> retriever[retriever\nrag.retrieve]
  gateway --> modelproxy[model-proxy\nrag.generate]
  retriever -- "FATAL: password auth failed\nfor user \"lab\" (repeated retries,\nseconds burned per request)" --> postgres[(Postgres)]
  style retriever fill:#5b2b2b,stroke:#e07a7a,color:#fff
  style postgres fill:#5b2b2b,stroke:#e07a7a,color:#fff
  linkStyle 4 stroke:#e07a7a,stroke-width:3px
  gateway -.->|p95 12-15s, SLO 2s breached| client
```
