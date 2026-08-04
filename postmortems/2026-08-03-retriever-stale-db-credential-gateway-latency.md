# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 20:15:45Z
- **Resolved:** 2026-08-03 20:20:45Z

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 20:12:24Z | log-spike | log-spike onset: routine: "auth_failed", |
| 20:15:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 20:15:10Z | alert | alert resolved: SLO gateway latency — fast burn |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785788145773%22%2C+%22to%22%3A+%221785788445750%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785788145773%22%2C+%22to%22%3A+%221785788445750%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset:     routine: "auth_failed", at 2026-08-03T20:12:24.986364+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset:     routine: "auth_failed", at 2026-08-03T20:12:24.986364+00:00

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0803 22:15:46.531575   55444 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 22:15:46.628738   55444 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 22:15:46.759419   55444 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 22:15:46.584527   47584 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 22:15:46.659019   47584 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
Gateway's fast-burn latency SLO alert fired because the `retriever` service began failing every Postgres query with `28P01 password authentication failed for user "lab"`. Gateway retried the failed retrieval calls, inflating `POST /v1/chat` end-to-end latency from a normal few hundred ms to 4.6–9s per request.

## Impact
Tenant `acme` chat requests through the gateway saw multi-second latency inflation (traces up to ~9s) for the duration of the incident, burning ~2% of the 28-day gateway latency error budget in under an hour. Retrieval-dependent responses were the ones affected; traces showed `gateway` spans with `errorCount:4` and `retriever` spans with `errorCount:1` per request — evidence of retry amplification, not a single slow call.

## Root cause
`deploy_history` and `grafana_annotations` (24h window) ruled out a bad deploy — the last deploy of any kind was ~21 hours before onset, and unrelated (platform/gateway gitops syncs). `kubectl_read`/`argo_app`/rollout tooling were unavailable (kube API "Unauthorized"), matching the pre-check's `kube_scan`/`rollout_state`/`secret_age` leads being UNAVAILABLE for the same reason — so pod describe/secret-age evidence could not be pulled directly.

Instead the evidence came straight from Postgres and the app logs:
- Postgres's own log (`container=postgres`) recorded `FATAL: password authentication failed for user "lab"` starting at the same moment as the pre-check `log_spike` lead's onset (routine `"auth_failed"`), matched against `pg_hba.conf` rule `host all all all scram-sha-256` — a genuine server-side auth rejection, not an app-side misparse.
- Every failing query came from a single long-lived `retriever` pod (`retriever-dc7ddd494-jv9j7`) whose `kube_pod_start_time` was ~22h before the incident — it had not restarted, so it was still holding whatever DB credential it read into its environment at startup.
- A fresh, per-call DB connection (`pg_select`, same role `"lab"`) succeeded throughout, proving the *current* password accepted by Postgres was valid — only the long-lived retriever process's cached credential was stale.
- `update_db_secret` (the tool that syncs a rotated vault credential into the in-cluster Secret) reported **no rotated credential pending** — i.e., the Secret itself was already correct; the retriever pod simply hadn't restarted to pick it up. This is the stale-secret failure mode from the `stale-secret.md` runbook, minus the "sync" step (already done by the time we checked).
- No relevant k8s events (OOM/restart/reschedule) were recorded for `retriever` or `postgres`, consistent with "pod kept running on a credential that fell out of sync" rather than a crash or bad rollout.

## What fixed it
Per the `stale-secret.md` runbook, the correct mitigation is a rolling restart of the affected workload so it re-reads the current (already-valid) credential. `restart_workload(retriever)` was dry-run, the diff was attached to an approval request, and the operator approved it. However, the real execution (`dry_run=false`) failed every attempt with the cluster's own `Unauthorized` error — the same kube-API write-path failure implied by the pre-check's `kube_scan`/`rollout_state`/`secret_age` leads. The retriever pod's `kube_pod_start_time` was checked again after the "successful" approval and had **not changed**, confirming the restart never actually applied.

Despite that, `alert_status` subsequently reported the alert resolved, fresh `retriever` logs showed zero new `28P01` lines, and a new `POST /v1/chat` trace came back with no error spans. The most defensible read of the evidence is that this was the tail end of a transient/self-clearing fault window (matching the vault having no pending rotation left to sync by the time it was checked) — **not** a fix applied by this on-call session. That distinction is reported explicitly rather than claimed as a resolved-by-remediation outcome.

## Lessons
- The on-call agent's kubectl/Argo write path is currently broken in this environment (`Unauthorized` on every kube-mutating call, and on plain `kubectl_read`) — this needs an infra fix; several pre-check leads were already flagged UNAVAILABLE for the identical reason and should have been treated as an environment health signal, not just missing evidence.
- `update_db_secret`'s dry-run answer ("nothing to sync") is a strong, fast disambiguator between "credential still needs syncing" and "credential already synced, pod just needs a restart" — worth calling out explicitly in the `stale-secret.md` runbook's diagnose section as its own branch.
- `kube_pod_start_time` versus the log-spike onset time is a clean, cheap way to confirm "long-lived pod, stale in-memory credential" without needing `kubectl describe` access at all.
- Because the write-path is broken, this class of incident cannot currently be self-healed by the on-call agent — needs either a working kube credential for the remediation tools or an alternate remediation path (e.g., an operator-triggered restart) until that's fixed.

```mermaid
flowchart LR
  client[Client] --> gateway[Gateway<br/>POST /v1/chat]
  gateway --> embedder[Embedder]
  gateway --> modelproxy[Model Proxy]
  gateway --> retriever[Retriever]
  retriever -- SCRAM auth --> postgres[(Postgres<br/>role "lab")]

  class retriever failedHop
  class postgres failedHop

  retriever -. "28P01 FATAL: password authentication failed<br/>(pod running 22h, stale in-memory credential —<br/>Secret itself was already current)" .-> postgres
  gateway -. "retries amplify latency:<br/>4.6s–9s per request, errorCount 4" .-> retriever

  classDef failedHop fill:#3a1220,stroke:#ff5b6a,stroke-width:2px,color:#fff
```
