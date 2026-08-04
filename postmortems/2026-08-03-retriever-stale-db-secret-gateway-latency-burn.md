# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 01:35:45Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 01:35:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 01:35:43Z | log-spike | log-spike onset: 2026-08-03 01:35:43.581 UTC [1709932] FATAL: password authentication failed for user "lab" |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785720945832%22%2C+%22to%22%3A+%221785721254860%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785720945832%22%2C+%22to%22%3A+%221785721254860%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: 2026-08-03 01:35:43.581 UTC [1709932] FATAL:  password authentication failed for user "lab" at 2026-08-03T01:35:43.582364+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: 2026-08-03 01:35:43.581 UTC [1709932] FATAL:  password authentication failed for user "lab" at 2026-08-03T01:3… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 03:35:51.082061   55816 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 03:35:51.637072   55816 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 03:35:51.862446   55816 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 03:35:51.413450   23048 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 03:35:51.587924   23048 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
Gateway latency SLO fired a fast-burn alert (2% of 28d budget in 1h). Root cause: the `retriever` service's Postgres credential (`user "lab"`) went stale — Postgres began rejecting every connection from `retriever` with `FATAL: password authentication failed for user "lab"` — while the in-cluster `subject-db-credentials` Secret still held the old value. This is the classic rotation-vs-restart mismatch: the vault credential was rotated but no workload was restarted against it, so every running (and every newly-scheduled) `retriever` pod kept presenting the stale password.

## Impact
Every gateway request on a code path that touches the retriever (embedding-backed retrieval queries) failed to complete normally: the retriever's `queryWithCache` calls errored on `Errors.postgres(parseError(x))` for the `chunks` similarity-search query, the request stalled/retried, and gateway's p95 latency for non-health routes pinned at the ~10s client timeout ceiling. Gateway's 5xx ratio climbed from a flat 0% baseline to 0%→2.6%→8.1%→(brief dip)→5.8%→40.5%→61.7%→84.4%→83.2% over the ramp, tracking the retriever pod's crash-loop (`BackOff` events on `retriever-8454db56c-msr56`, seen x20 within ~2 minutes) as Kubernetes kept restarting a pod that could never succeed with the same stale credential. `postgres` itself was healthy throughout — an admin-credentialed probe query (`select 1`) succeeded the entire time — this was never a database outage, only an authentication mismatch for one application identity.

## Root cause
Stale database secret. `deploy_history` shows no deploy to `gateway` or `retriever` in the incident window (last gateway deploy was gitops commit `bb634a3`, ~2 hours prior — ruled out as the reflex bad-deploy explanation per the runbook's own step 2). The failure signature — `password authentication failed for user "lab"` appearing simultaneously in `postgres` and `retriever` logs, with no other workload affected, no deploy, and `postgres` otherwise healthy — matches the `stale-secret.md` runbook exactly. Direct confirmation of the Secret's last-modified timestamp (the `secret_age` pre-check lead, and `kubectl describe`/`kubectl get secret`) was unavailable: the investigating agent's cluster credentials returned `Unauthorized` for every k8s read in this incident, consistent with the pre-check's `kube_scan`/`rollout_state`/`secret_age` all reporting the same "You must be logged in to the server" error. The behavioral evidence (onset timing, single-user/single-workload blast radius, healthy DB, no deploy, crash-looping fresh pods still failing) is strong enough to name the cause with confidence despite that gap.

## What fixed it
**Remediation was not completed — the incident is unresolved.** Per the runbook: dry-run `update_db_secret` first (returned action_id `137b7791fd3ee637`, confirming a rotated credential is present in the vault to sync), got explicit operator approval (`apr_19fc544b752165`), then attempted the real sync (`dry_run=false`). All three execution attempts failed with the same cluster-side `Unauthorized` error that blocked every other cluster-write/read tool this session. This is an infrastructure access problem separate from the diagnosed root cause, not a diagnosis error — the correct fix (sync `subject-db-credentials` from the vault, then rolling-restart `retriever` so new pods pick it up) is known and approved but could not be applied through the available tooling. Per the runbook, `restart_workload` was deliberately **not** run ahead of the secret sync, since restarting against the same stale credential would only reproduce the failure on a fresh pod. `alert_status` was re-queried after the failed execution attempts and still reports the alert active.

## Lessons
- Escalate for cluster credential access (or a break-glass path) before the next stale-secret incident — a correctly-diagnosed, correctly-approved remediation was blocked purely by the agent's kubeconfig being unauthorized, which is now a repeat failure mode across `kube_scan`, `rollout_state`, `secret_age`, and the live `update_db_secret` write.
- The `stale-secret.md` runbook's diagnostic ordering worked well even with the primary `secret_age` lead unavailable — the log-signature (single user, single workload, healthy DB, no deploy) was sufficient corroborating evidence on its own.
- Once cluster access is restored: sync `subject-db-credentials`, then `restart_workload` for `retriever` (and any other service found to hold the same credential — checked here and only `retriever`/`postgres` showed the failure), then verify via `alert_status` and a fresh `loki_query` for `"password authentication failed"` showing no new occurrences.

```mermaid
flowchart LR
    Client -->|HTTP| Gateway
    Gateway --> Retriever
    Gateway --> ModelProxy[Model Proxy]
    Retriever -->|"FATAL: password authentication\nfailed for user \"lab\"\n(stale Secret, never restarted\nafter vault rotation) — BROKEN HOP"| Postgres[(Postgres)]
    ModelProxy -.->|unaffected, different query path| Postgres
    Retriever -.->|embeddings ok| Embedder

    style Retriever fill:#3a1420,stroke:#ff5f6d,stroke-width:2px
    style Postgres fill:#1a2a1a,stroke:#4caf50
    linkStyle 2 stroke:#ff5f6d,stroke-width:3px
```
