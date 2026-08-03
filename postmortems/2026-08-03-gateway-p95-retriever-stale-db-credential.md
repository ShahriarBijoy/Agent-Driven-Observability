# Postmortem: gateway p95 latency above 2s

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 02:03:41Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 02:03:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 02:03:32Z | log-spike | log-spike onset: 41 \| throw new DrizzleQueryError(queryString, params, e); |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785722621602%22%2C+%22to%22%3A+%221785722995322%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785722621602%22%2C+%22to%22%3A+%221785722995322%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: 41 |         throw new DrizzleQueryError(queryString, params, e); at 2026-08-03T02:03:32.145350+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: 41 |         throw new DrizzleQueryError(queryString, params, e); at 2026-08-03T02:03:32.145350+00:00

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 04:03:42.849895   39808 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:03:42.987161   39808 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:03:43.062929   39808 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 04:03:42.847407   10376 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:03:42.999818   10376 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
`Gateway p95 latency > 2s` (sev1, tenant acme) fired with no runbook auto-matched on the alertname. Investigation traced it to the `retriever` service failing 100% of its Postgres queries with a credential error, which stalls every gateway request that needs a retrieval step until it times out or exhausts retries — inflating gateway p95 without necessarily crossing a 5xx-rate threshold (so the existing `gw-5xx`/`stale-secret` alert-name matching didn't fire, only the latency alert did).

## Impact
Every gateway request path that calls `retriever` degraded to worst-case latency (retry storm against a Postgres role that outright rejects the credential). `pg_select` against `inferences` for the incident window returned zero rows for any tenant — i.e. essentially no successful end-to-end completions were being recorded while the fault was active.

## Root cause
`retriever`'s Postgres connection is rejected with `PostgresError: password authentication failed for user "lab"`, confirmed on the Postgres side itself (`FATAL: password authentication failed for user "lab"`, `pg_hba.conf` line 128, `scram-sha-256`) — this is a genuine credential rejection, not an app-side misparse. Postgres itself never restarted or reloaded config in the window, and `deploy_history`/`gitea_ci_runs` show **no deploy or code change to `retriever` or `gateway`** anywhere near onset (closest gateway deploy was ~2.5h earlier; recent CI commits only touched `load-generator` and `model-proxy`). Only the `retriever` container logs the failure — `gateway`, `model-proxy`, and `embedder` are clean. This matches the stale-secret signature from the `stale-secret.md` runbook (rotation the running pod's env never picked up) rather than a bad deploy or a Postgres outage: the currently-running `retriever` pod (`retriever-dc7ddd494-jv9j7`) suddenly started rejecting on a role it had presumably been using successfully, with no pod restart of its own. `update_db_secret` (the vault→Secret sync tool) reported *no rotated credential pending sync*, meaning the Secret/vault are already consistent with the correct password — the only stale artifact left is the already-running pod's in-memory/env credential from before that rotation landed.

## What fixed it
Diagnosed and proposed the standard fix for this signature: a rolling restart of `deployment/retriever` so it re-reads the current (already-correct) Postgres credential from the Secret on pod start. This was dry-run, approved by the operator, and then executed — but **every execution attempt (3x) failed with `Unauthorized` against the Kubernetes API**, the same failure mode already flagged as `UNAVAILABLE` in this incident's pre-checks (`kube_scan`, `rollout_state`, `secret_age`) and independently reproduced here via `kubectl_read` and `argo_app`. This is a separate infrastructure fault — the on-call agent's own cluster credentials are being rejected cluster-wide — blocking remediation execution entirely. **The remediation was not applied and the alert remains active** (`alert_status` re-queried after the failed execution still reports `active: true` since 02:03:10Z). This incident is being closed unresolved from the automation's side; a human with valid cluster credentials needs to either run the rolling restart of `retriever` directly, or restore the on-call agent's Kubernetes API access first.

## Lessons
- The alert-to-runbook matcher only keys off `alertname`, so a stale-DB-credential fault that manifests as *latency* (retry stalls) rather than *error rate* skips straight past `stale-secret.md`'s auto-match. Worth adding `Gateway p95 latency > 2s` as a secondary trigger on that runbook, or teaching the matcher to also consider the `log_spike` pre-check lead's content (it named `DrizzleQueryError` explicitly) rather than only the alertname.
- `update_db_secret`'s "nothing to sync" response is itself diagnostic signal — it distinguishes "Secret is stale" (needs vault sync) from "pod is stale" (needs only a restart) and should be surfaced/logged as such rather than treated as a dead end.
- The on-call agent's own Kubernetes credentials being rejected is a blind spot: the pre-check battery already flagged this (`kube_scan`/`rollout_state`/`secret_age` all `UNAVAILABLE`/`Unauthorized`) before any remediation was attempted, but the workflow still proceeded through full diagnosis and an approved dry-run before discovering execution was impossible. A cluster-auth health check up front would save an approval round-trip in this exact failure mode.

```mermaid
flowchart LR
    client[Client] --> gateway[gateway]
    gateway --> retriever[retriever]
    gateway --> modelproxy[model-proxy]
    retriever -- "FATAL: password authentication failed\nfor user \"lab\" (stale credential,\npod never restarted after rotation)" --> postgres[(postgres)]
    modelproxy --> postgres
    style retriever fill:#3a1414,stroke:#ff6b6b,stroke-width:2px
    style postgres fill:#3a1414,stroke:#ff6b6b,stroke-width:2px
    linkStyle 2 stroke:#ff6b6b,stroke-width:3px
```

Remediation attempted: rolling restart of `retriever` (approved) — **blocked**, Kubernetes API rejected the on-call agent's credentials on every attempt. Alert still active; escalate to a human operator with valid cluster access.
