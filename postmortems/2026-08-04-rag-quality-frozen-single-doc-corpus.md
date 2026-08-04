# Postmortem: RAG top-1 relevance below the 90% objective over the last hour (burn-rate alerting saturates for a loose SLO)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-04 00:15:48Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 00:14:41Z | log-spike | log-spike onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"ed2015a85e9eddbc5d01f295df795056","span_id":"42a1f23c4322b603","time":"2026-08-04T00:14:41.778Z","reason":"The operation timed out.","job":"r… |
| 00:15:10Z | alert | alert firing: SLO RAG quality — below objective |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785802548959%22%2C+%22to%22%3A+%221785803003475%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785802548959%22%2C+%22to%22%3A+%221785803003475%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"ed2015a85e9eddbc5d01f295df795056","span_id":"42a1f23c4322b603","time":"2026-08-04T00:14:41.778Z","reason":"The operation timed out.","job":"rag.embed","eventType":"START"} at 2026-08-04T00:14:41.778542+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"ed2015a85e9eddbc5d01f295df795… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 02:15:51.623072   56580 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 02:15:52.110077   56580 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 02:15:52.437051   56580 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 02:15:51.675455   53664 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 02:15:52.513973   53664 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

The `SLO RAG quality — below objective` (sev2) alert fired because top-1 retrieval relevance for tenant acme (and all tenants sharing the corpus) has been pinned at ~0.15–0.2 out of 1.0 for every live request, far under the 90% objective. This is a "loose SLO" burn-rate alert, so it took a long sustained period of bad relevance to saturate the error budget and fire — consistent with the underlying cause being weeks old, not a fresh regression.

## Impact

Every RAG chat completion across all tenants (acme, bravo, abuser) during the window returned answers grounded in irrelevant context. `POST /v1/chat` kept returning HTTP 200 — no user-visible errors, no latency-based paging — so this was a silent quality degradation, exactly the kind a relevance SLO exists to catch instead of an error-rate/latency alert.

## Root cause

The retrieval corpus (`chunks` table) has collapsed to a single document. Direct evidence:

- `SELECT count(DISTINCT doc_id), count(*), max(created_at), min(created_at) FROM chunks` → **1 distinct document**, 991 chunks, all ingested in the same second at `2026-07-18T23:59:09Z`. Nothing has been ingested since.
- Every `rag.retrieve` span captured in Tempo during the incident window — across different tenants, different timestamps, both "fast" (~2s) and "slow" (~12s) traces — carries the identical attribute `rag.retrieved_doc_ids = [pg1342, pg1342, pg1342]` for `rag.top_k=3`. The retriever cannot return anything else: there is only one document to retrieve from.
- The live Mimir histogram `sum(retrieval_relevance_score_bucket) by (le)` over 84,591 scored requests shows 98.2% of requests scoring ≤0.2 and **0% scoring above 0.3** — a hard structural ceiling, not noise.
- `dq_violations` shows a continuously-firing `freshness` check on the `inferences` dataset (staleness climbing in lock-step with wall-clock time, currently ~984,000s / ~11.4 days) and a `volume` check (`low_volume`, ratio 0.0) recorded on 2026-07-23 — independent corroboration that the data pipeline feeding this system stalled well before today and was never recovered.
- Ruled out a bad deploy: `deploy_history`/`grafana_annotations` show the last gateway/platform deploys were 2026-08-02 ~23:15–23:32 UTC (gitops shas `1142aba`…`bb634a3`), two weeks after the corpus froze on 2026-07-18 — no temporal correlation.
- The `lineage emit failed … operation timed out` warnings on `rag.embed`/`rag.retrieve` (the pre-check log-spike lead) are a secondary, cosmetic symptom (OpenLineage emission to Marquez timing out) and track a separate, already-recurring latency issue in this repo's postmortem history (`gateway-lineage-emit-timeout-*`). They do not explain the relevance collapse — the doc-id duplication is present even in traces where `rag.retrieve` completed in ~2s, long before the lineage timeouts got bad.

No runbook exactly matches this alertname; the closest, `dq-freshness-stall.md`, was consulted and its diagnostic steps (confirm dataset staleness, check the producing job) match this incident, but its mitigation ("restart the producing job") does not apply here: the document-ingestion/loader job that populates `chunks` is not one of the workloads this on-call agent can act on (`gateway | model-proxy | retriever | embedder | load-generator`) — `load-generator` only replays synthetic chat traffic, it does not load source documents.

## What fixed it

**Nothing — no remediation was executed.** None of the available remediation tools (`scale_deployment`, `patch_memory_limit`, `restart_workload`, `rollout_undo/abort/promote`, `update_db_secret`) touch the document corpus; restarting or scaling `retriever`/`embedder` would not add a single new document to `chunks` and was deliberately not attempted, since it would not have addressed the evidenced root cause and would have burned an approval on a no-op. `alert_status` was re-queried after the investigation and is still **active** — this incident is not resolved. Recovery requires re-running the document ingestion/loader pipeline (or whatever process is meant to keep `chunks` fresh) to repopulate the corpus with a real, diverse document set; that action is outside this agent's tool surface and needs a data-engineering follow-up.

## Lessons

- This on-call surface has no remediation path for "the retrieval corpus itself is stale/collapsed" — worth adding a `retrigger-ingestion`-style tool, since `dq-freshness-stall.md`'s own mitigation step ("restart the producing job") is currently unactionable for this exact failure mode.
- A relevance SLO built on a loose burn-rate window let a two-week-old, 100%-reproducing bug sit silently until the budget finally saturated. A tighter fast-burn window (or a simple absolute floor alert on `retrieval_relevance_score` p50) would have caught this in hours, not weeks.
- `rag.retrieved_doc_ids` repeating the same id 3x for `top_k=3` is a cheap, high-signal canary for "corpus has effectively one usable document" — worth a dedicated recording rule/alert rather than relying on the downstream relevance-score SLO to eventually notice.
- The freshness/volume `dq_violations` on `inferences` were themselves stale (last real evaluation 2026-07-23) — the data-quality monitoring for this pipeline has its own gap that should be investigated separately.

```mermaid
flowchart LR
  client[Client] --> gateway[Gateway :8080]
  gateway -->|POST /v1/embed| embedder[Embedder :8081]
  gateway -->|POST /v1/retrieve| retriever[Retriever :8082]
  retriever --> corpus[(chunks / vector corpus\npostgres)]
  gateway -->|POST /v1/complete| modelproxy[Model-proxy :8083]
  modelproxy --> gateway
  gateway --> client

  ingest[Document ingestion / loader job\n(no controllable workload)] -.->|"last write 2026-07-18T23:59Z\nNEVER RUNS AGAIN"| corpus

  style corpus fill:#7a1f1f,stroke:#ff4d4d,stroke-width:3px,color:#fff
  style ingest fill:#3a2020,stroke:#ff4d4d,stroke-width:2px,stroke-dasharray:5 5,color:#fff

  corpus -.->|"ROOT CAUSE: frozen at 1 doc (pg1342, 991 chunks)\nevery rag.retrieve top-3 returns the same doc 3x\ntop-1 relevance capped ~0.15-0.2, SLO objective 90%"| retriever
```
