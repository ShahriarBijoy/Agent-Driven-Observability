# Postmortem: gateway p95 latency above 2s

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 20:11:41Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 20:11:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 20:11:40Z | log-spike | log-spike onset: at ErrorResponse (/app/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/connection.js:817:22) |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785787901640%22%2C+%22to%22%3A+%221785788203685%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785787901640%22%2C+%22to%22%3A+%221785788203685%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset:       at ErrorResponse (/app/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/connection.js:817:22) at 2026-08-03T20:11:40.952788+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset:       at ErrorResponse (/app/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/connection.js:817:22)… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 22:11:43.502303   21056 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 22:11:43.681690   21056 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 22:11:43.804723   21056 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 22:11:43.680640   36676 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 22:11:43.847907   36676 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

The `Gateway p95 latency > 2s` (sev1) alert fired for tenant `acme`. Root cause was isolated to the `retriever` service, one hop downstream of `gateway` in the RAG serving path: its single running pod (`retriever-dc7ddd494-jv9j7`) was fatally failing every Postgres connection attempt with `password authentication failed for user "lab"` (Postgres code `28P01`, routine `auth_failed`). This is not the automated "rotate password without updating the Secret" chaos signature — `update_db_secret` dry-run confirmed the vault has **no pending rotation to sync**, meaning the Kubernetes Secret already holds the correct credential. The mismatch is pod-local: this retriever pod is holding a stale in-memory/env credential from before the credential was last synced, and — because Kubernetes does not hot-reload `secretKeyRef` env vars into a running container — it never picked up the current value.

## Impact

Every sampled `gateway` root trace (`POST /v1/chat`) during the window breached the 2s SLO, ranging 2.76s–11.04s, roughly 1.4x–5.5x over threshold. Tempo traces show the `retriever` span erroring on each of these requests, with `gateway` itself showing errors on 4 of 5 spans per trace — consistent with retry/backoff against the failing downstream dependency rather than a gateway-side fault. Log volume for error/failed lines on the retriever service ran ~200x baseline for the duration of the incident. `gateway`'s own request handling (e.g. cache-hit chat completions) continued to serve normally, confirming the fault was scoped to the DB-dependent retrieval path, not the gateway process itself.

## Root cause

`retriever`'s live Postgres connection pool held a credential for user `lab` that Postgres now rejects (`28P01`/`auth_failed`), while the Kubernetes Secret and vault are already in agreement on the current, correct value (`update_db_secret` dry-run: "no rotated credential found in the vault — nothing to sync"). Our own `pg_select` tool connects successfully against the same database, ruling out a Postgres-side outage. This points to a credential-sync-vs-restart gap: the Secret was updated at some point, but this specific `retriever` pod was never restarted afterward to pick up the refreshed value, so it kept retrying with what is now a stale credential on every request, burning latency on each failed handshake plus gateway-side retries.

## What fixed it

Diagnosis and remediation plan: dry-run `restart_workload(retriever)` (rolling restart, no spec change) so the pod re-reads the current, already-correct Secret on startup. The operator approved the action (`request_approval` — one-sentence summary + verified diff from the dry-run). **Execution failed**: both attempts at `restart_workload(retriever, dry_run=false)` returned `Unauthorized` from the cluster API — the same credential/authorization fault the pre-check battery had already flagged as `UNAVAILABLE` on `kube_scan`, `rollout_state`, and `secret_age` (agent-remediate's kubeconfig cannot currently authenticate to the k8s API for either reads or writes). This is an environment/access fault blocking remediation, not a retryable transient error, and not something addressable from this toolset. **The alert is still ACTIVE** — re-queried `alert_status` after both failed restart attempts and it continues to report firing. This incident is being closed unresolved; the approved remediation (rolling-restart `retriever`) still needs to be applied by an operator with working cluster credentials.

## Lessons

- Add an explicit runbook for this alert (`Gateway p95 latency > 2s` currently has no matched runbook) covering the "Secret already correct, pod hasn't restarted" variant of credential staleness — distinct from the existing `stale-secret.md`, which assumes the Secret itself is behind the vault.
- Whatever process rotates/syncs the DB credential into the Secret should also trigger (or verify) a rolling restart of every consumer at the same time; a Secret update with no consumer restart is a latent time-bomb that only surfaces as a downstream latency/error alert later.
- The `agent-remediate` cluster credentials being unauthorized for both read (`kubectl_read`, `argo_app`, `rollout_status`) and write (`restart_workload`) operations is itself an operational gap — on-call automation was unable to execute an operator-approved, low-risk rolling restart. This should be treated as its own follow-up: verify/rotate the agent-ro and agent-remediate kubeconfigs.

```mermaid
flowchart LR
    Client --> Gateway["gateway (POST /v1/chat)"]
    Gateway --> Retriever["retriever"]
    Gateway --> Embedder["embedder"]
    Gateway --> ModelProxy["model-proxy"]
    Retriever -->|"FATAL 28P01 password authentication failed for user \"lab\" (stale in-pod credential)"| PG[("Postgres")]

    style Retriever fill:#c0392b,stroke:#e74c3c,stroke-width:2px,color:#fff
    style PG fill:#7f1d1d,stroke:#e74c3c,stroke-width:2px,color:#fff
    linkStyle 3 stroke:#e74c3c,stroke-width:3px
```
