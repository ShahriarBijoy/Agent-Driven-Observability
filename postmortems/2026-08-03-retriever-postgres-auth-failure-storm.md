# Postmortem: gateway 5xx rate above 2%

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-03 02:25:40Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 02:25:10Z | alert | alert firing: Gateway 5xx rate > 2% |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785723940367%22%2C+%22to%22%3A+%221785724295221%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785723940367%22%2C+%22to%22%3A+%221785724295221%22%7D%7D%7D&orgId=1)

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
gateway: E0803 04:25:47.296060   62600 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:25:48.034858   62600 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:25:48.287370   62600 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0803 04:25:49.582133   13324 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0803 04:25:50.072688   13324 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
Gateway 5xx rate crossed the 2% threshold for tenant `acme` while `retriever` was in a continuous, high-frequency connection-retry storm against Postgres, every attempt rejected with `password authentication failed for user "lab"`.

## Impact
RAG requests routed through `retriever` failed or timed out (surfaced upstream as gateway 5xx and as `lineage emit failed / operation timed out` warnings on the `rag.retrieve`/`rag.inference` spans in both `retriever` and `gateway`), degrading chat completions for tenants relying on retrieval.

## Root cause
`postgres-7dbfc8579d-76znp` logged a tight, ongoing burst of `FATAL: password authentication failed for user "lab"` originating from `retriever`, with no cooldown — dozens of distinct backend PIDs failing within single-digit seconds, continuing through the entire investigation window. Evidence ruling out the two obvious alternatives:
- **Not a bad deploy**: `deploy_history` showed zero deploys/commits touching `retriever` or `postgres` in the incident window (only an unrelated `gateway` gitops sync and `load-generator` CI churn ~50+ minutes earlier).
- **Not a pending secret rotation**: `update_db_secret` (dry-run) reported *no rotated credential in the vault to sync* — the credential path retriever should be using is already the current one; there is no outstanding rotation for it to catch up to.

That leaves the credential mismatch sitting specifically on the long-lived `retriever` pod, which never restarted and is holding a connection/credential state Postgres no longer accepts — the textbook "workload never restarted to pick up the current value" signature the `stale-secret` runbook describes, just without an in-flight rotation left to sync.

## What fixed it
Dry-ran a rolling restart of `retriever` (diff: `restartedAt` annotation bump, no spec change), got explicit operator approval (`apr_19fc574d6d0658`), then attempted to execute for real. **The execution call failed twice in a row with `Unauthorized` from the Kubernetes API** — the same failure already visible in the pre-check leads (`kube_scan`/`rollout_state` both UNAVAILABLE with the identical credential error). The remediation was never actually applied to the cluster. Re-querying `alert_status` afterward still shows the alert **active** — recovery was not achieved. This incident is being closed **unresolved**; the on-call agent's cluster credentials need to be restored before the approved restart can be carried out.

## Lessons
- The agent's own kubeconfig/API credentials were stale/unauthorized for the entire incident — this blocked not just remediation but also direct pod-describe evidence (secret age, pod start time), forcing the diagnosis to lean entirely on Loki/deploy_history/vault-sync signal. Fix the agent's cluster auth as its own follow-up item, independent of this incident.
- `update_db_secret`'s dry-run doubling as a "is there even a rotation to chase" check was valuable — it let us rule out the classic stale-secret remediation path in one call instead of guessing.
- Once cluster access is restored, re-run the approved `retriever` restart (action_id `7a540f71e5a6becd` is now consumed/stale — a fresh dry-run will be needed) and confirm the FATAL auth-failure line disappears from Postgres logs.

```mermaid
flowchart LR
    client[Client] --> gateway[gateway]
    gateway --> retriever[retriever]
    gateway --> modelproxy[model-proxy]
    retriever -- "FATAL: password authentication failed\nfor user \"lab\" (ongoing storm)" --> postgres[(postgres)]
    modelproxy --> llm[[mock-llm]]
    style postgres fill:#5a1f1f,stroke:#e05252,stroke-width:2px
    style retriever fill:#5a1f1f,stroke:#e05252,stroke-width:2px
    linkStyle 2 stroke:#e05252,stroke-width:3px
```
