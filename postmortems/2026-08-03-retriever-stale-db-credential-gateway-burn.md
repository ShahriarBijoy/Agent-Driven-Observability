# Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 02:28:42Z
- **Resolved:** 2026-08-03 02:33:43Z

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 02:28:10Z | alert | alert firing: SLO gateway availability — fast burn |
| 02:28:10Z | alert | alert resolved: SLO gateway availability — fast burn |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785724122896%22%2C+%22to%22%3A+%221785724423014%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785724122896%22%2C+%22to%22%3A+%221785724423014%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match (2):** `gateway-high-error-rate.md`, `stale-secret.md` — toolset narrowed to 13 tools: alert_status, deploy_history, kubectl_read, loki_query, mimir_query, publish_postmortem, request_approval, restart_workload, runbook_lookup, runbook_read, save_artifact, tempo_query, update_db_secret

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
gateway: E0803 04:28:44.229106   20112 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:28:44.333947   20112 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:28:44.531853   20112 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 04:28:44.258735    6192 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:28:44.362623    6192 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

`SLO gateway availability — fast burn` fired for tenant `acme`. Root cause: the **retriever** pod was authenticating to Postgres with a stale credential and failing continuously with `PostgresError: password authentication failed for user "lab"`, which cascaded into gateway request failures/timeouts on the RAG path and burned the availability error budget. The incident recovered on its own before the approved remediation could actually be applied — see "What fixed it" below for why credit for the fix does **not** go to this session's action.

## Impact

Gateway `POST /v1/chat` requests that hit the retrieval path failed or hung for several seconds to ~10s (seen directly in Tempo traces with nested error spans across gateway → retriever/model-proxy). `slo:gateway_availability:error_ratio1h` climbed from ~0 to ~0.76 starting around the retriever failure onset and stayed elevated (0.6–0.9) through alert firing, driving the fast-burn evaluation over threshold.

## Root cause

- Evidence: `{namespace="subject", service_name="retriever"} |= "password authentication failed"` returned a dense, continuous stream of `PostgresError: password authentication failed for user "lab"` from pod `retriever-dc7ddd494-jv9j7` — hundreds of occurrences densely packed in narrow multi-second windows, i.e. a tight retry loop, not a one-off blip.
- `deploy_history` showed **no deploy of retriever itself** in the incident window — ruling out a bad code deploy on that workload (the recent_deploys precheck lead was correctly negative for the 60-minute window). It did show four rapid `platform` gitops syncs and one `gateway` gitops sync shortly beforehand.
- `kube_pod_start_time{pod="retriever-dc7ddd494-jv9j7"}` = a boot time that predates every one of those platform/gateway gitops syncs, and `kube_pod_container_status_restarts_total` for that pod was `0` — the retriever process had been running continuously since before the platform-side change and was never cycled by it, while gateway's pods (checked the same way) were newer, consistent with having received a fresh environment during their own redeploy.
- `update_db_secret` (dry_run) reported "no rotated credential found in the vault — nothing to sync" — ruling out an active, unsynced rotation as the *current* state of the Secret; the credential source was already reconciled, and only the long-lived retriever process was holding something stale.
- Together this is the signature of a platform-side database credential change that every freshly-rolled pod absorbed automatically, while the one pod nobody restarted (retriever) kept authenticating with what it had cached from before the change.

**Cause category:** stale/mismatched database credential in a long-lived pod that missed a restart around a platform credential change — not a bad application deploy, not an actively-in-progress secret rotation needing a sync.

## What fixed it

I dry-ran `restart_workload(retriever)`, got operator approval, and executed it — **twice** — but both execution calls returned a Kubernetes API `Unauthorized` error (matching the same "You must be logged in to the server" failure the precheck's `kube_scan`/`rollout_state`/`secret_age` leads had already flagged, and that `kubectl_read describe` also hit during investigation). A follow-up check of `kube_pod_start_time` for the retriever pod after the failed execute calls showed the **same boot time and 0 restarts as before** — the restart never actually applied.

Despite that, independent telemetry shows the incident recovered anyway: `slo:gateway_availability:error_ratio5m` read `0`, a fresh Loki query for `"password authentication failed"` over the last 5 minutes returned zero matches, and `alert_status` reported inactive on two consecutive checks. The most consistent explanation given the evidence (Secret already reconciled per `update_db_secret`, no pod restart occurred) is that the mounted credential eventually re-synced into the running retriever pod on its own (Kubernetes periodically re-syncs Secret volume mounts into already-running pods without requiring a restart) and the connection pool recovered once that propagation completed. **This was not a result of the remediation executed in this session** — the approved fix never actually landed, and the cluster write-access problem for the remediation identity remains unaddressed.

## Lessons

- The remediation identity's Kubernetes credentials are broken for at least some read and all attempted write operations in this cluster right now (`kubectl_read`, `restart_workload` execute, plus the precheck's own `kube_scan`/`rollout_state`/`secret_age` leads) — this needs to be fixed independently of this incident, or on-call remediation is theater: approvals get granted for actions that silently fail to apply.
- A platform/gitops change that rotates a shared credential should force a rolling restart of every consumer, not rely on incidental redeploys; retriever had no reason to restart on its own and was the only workload left holding a stale credential.
- Secret-volume propagation delay to already-running pods is a real, silent failure window — consider alerting on "auth failure count for a pod whose start time predates the last credential change" directly, rather than only on the resulting SLO burn.

```mermaid
flowchart LR
    Client([Client]) -->|POST /v1/chat| Gateway[gateway]
    Gateway --> Retriever[retriever]
    Gateway --> Embedder[embedder]
    Gateway --> ModelProxy[model-proxy]
    Retriever -->|"❌ password authentication failed\nfor user \"lab\" (stale credential,\npod never restarted after\nplatform secret change)"| Postgres[(Postgres)]
    Embedder --> Postgres
    classDef broken fill:#3a1414,stroke:#d33,stroke-width:2px,color:#f5b5b5
    class Retriever,Postgres broken
    classDef ok fill:#132018,stroke:#2f8f4e,color:#bfe8cd
    class Gateway,Embedder,ModelProxy,Client ok
```
