# Postmortem: RAG top-1 relevance below the 90% objective over the last hour (burn-rate alerting saturates for a loose SLO)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-04 12:40:48Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 12:27:06Z | k8s | ReplicaSet/retriever-8454db56c: SuccessfulCreate |
| 12:27:06Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 12:27:06Z | k8s | Pod/retriever-8454db56c-q2b86: Scheduled |
| 12:27:08Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:09Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:09Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:11Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:11Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:11Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:13Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:14Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:16Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:24Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:24Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:24Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:27Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:36Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:47Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:27:47Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:27:47Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:27:49Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:50Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:27:56Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:28:43Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:28:43Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:28:43Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:28:46Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:28:47Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:29:48Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:30:10Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:30:10Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:30:10Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:30:13Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:30:16Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:31:26Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:32:37Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:32:57Z | k8s | Pod/retriever-8454db56c-q2b86: Started |
| 12:32:57Z | k8s | Pod/retriever-8454db56c-q2b86: Pulled |
| 12:32:57Z | k8s | Pod/retriever-8454db56c-q2b86: Created |
| 12:32:59Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:33:03Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:33:06Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:34:15Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:35:01Z | log-spike | log-spike onset: {"level":"warn","service":"gateway","message":"lineage emit failed","trace_id":"56dd9b3632f4d2fa42b5305d96007259","span_id":"ff7157aa40a65062","time":"2026-08-04T12:35:01.287Z","reason":"The operation timed out.","job":"ra… |
| 12:35:16Z | k8s | Pod/retriever-8454db56c-q2b86: BackOff |
| 12:36:08Z | k8s | ReplicaSet/retriever-8454db56c: SuccessfulDelete |
| 12:36:08Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 12:40:10Z | alert | alert firing: SLO RAG quality — below objective |
| 12:49:57Z | verification | recovery NOT verified — deadline armed |
| 12:55:35Z | log-spike | log-spike onset: [gateway] unhandled error: 16 \| } |
| 13:01:12Z | log-spike | log-spike onset: error: Malformed JSON in request body |
| 13:06:09Z | verification | recovery NOT verified — deadline armed |
| 13:14:26Z | verification | recovery NOT verified — deadline armed |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785847248598%22%2C+%22to%22%3A+%221785849826548%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785847248598%22%2C+%22to%22%3A+%221785849826548%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — OK
error/failed log rate normal: 0/10min vs baseline 0/10min

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 15:20:09.216016   38728 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 15:20:09.286078   38728 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 15:20:09.352433   38728 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 15:20:09.218297   50240 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 15:20:09.303075   50240 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

`SLO RAG quality — below objective` (tenant acme) remains active. This is the third investigation pass on the same underlying incident. This round's mandate was to check whether the prior "fix" was itself stuck (e.g. red CI) and to bring genuinely new evidence rather than repeat the prior conclusion — both the assigned hypothesis and one additional hypothesis I raised myself came back negative, and the corpus-completeness root cause from the previous two rounds is now confirmed a third time on independent signals.

## Impact

Top-1 retrieval relevance for tenant acme sits at ≈0.150–0.151 (median, gateway-emitted `retrieval_relevance_score` histogram, 44k+ live growing samples) against a 0.90 objective — essentially 100% of scored retrievals land in the (0.1, 0.2] bucket, with zero samples above 0.3 anywhere in the window. RAG answers are being generated against near-irrelevant context for the entire acme traffic volume.

## Root cause

**Structural corpus completeness, not a code/infra regression.** `chunks` has 991 rows spanning exactly **1 distinct `doc_id`**, loaded once and unchanged since 2026-07-18. One document cannot produce a relevant top-1 match against varied live queries — the retrieval pipeline is working correctly on top of an empty problem: there is nothing else to retrieve.

This round tested two new hypotheses to rule out a fixable cause, both negative:
1. **"Is the fix itself stuck?"** (the assigned re-check) — `deploy_history` shows nothing shipped in 24h; `gitea_ci_runs` (reviewed back through run #100/2026-07-25) contains zero commits touching corpus ingestion, retrieval, or embedding — only unrelated load-generator/model-proxy/WSL-clock/security commits. There is no ingestion pipeline, PR, or CI run to be "stuck" — none exists in this repo's history.
2. **"Is the embedder returning a constant/broken embedding?"** (my own hypothesis, prompted by the suspiciously narrow score band) — embedder logs show a healthy, varying mix of `cached:true`/`cached:false` across differing `textLength` values and distinct trace IDs, consistent with normal per-query embedding + a working cache, not a broken cache key collapsing all inputs to one vector.

One genuine-but-separate anomaly surfaced: the retriever logs a recurring `"lineage emit failed", "reason":"The operation timed out."` warning on every `rag.retrieve` call (OpenLineage → Marquez emission). This is a real fault but it is a fire-and-forget observability side-channel, not on the retrieval-scoring path — retrieval itself completes and returns scores every call, and the timeout doesn't explain a flat, content-independent relevance ceiling. Treated as a distractor, same as the stale-`inferences`-write-path and malformed-JSON findings from prior rounds (the `inferences` table is still ~11.9 days stale per live `dq_violations` freshness checks — also real, also not this alert's cause, since the SLO is computed from the live gateway histogram, not that table).

## What fixed it

**Nothing — no remediation was executed.** No tool on this on-call surface (`restart_workload`, `rollout_undo/abort/promote`, `scale_deployment`, `patch_memory_limit`, `update_db_secret`) touches corpus/ingestion data, and none of them has any causal path to "how many documents are in `chunks`." Executing any of them would not move the metric and would burn an approval cycle on a hypothesis already falsified twice before this round. `alert_status` re-checked at the end of this round: still active, unchanged, as expected with no remediation applied.

## Lessons

- This is now confirmed on a third pass across independent signals (Postgres `chunks` state, live gateway histogram, embedder cache behavior, CI/deploy history) — the corpus-completeness explanation is solid, not a guess.
- The actual fix is outside on-call tooling: a real multi-document ingestion job needs to run against `chunks`, and a completeness/cardinality DQ check on `chunks.doc_id` should exist so a thin corpus is caught before it burns an SLO, not after.
- A runbook should be authored for this exact alert stating explicitly that it is not restart/rollback/scale-fixable, so future on-call passes don't re-derive the same conclusion from scratch a fourth time.
- The retriever's OpenLineage timeout and the 11.9-day-stale `inferences` write path are both real, independent issues worth their own tickets — neither should be re-investigated as candidate causes for this specific SLO again; both were checked and ruled out across this round.

```mermaid
flowchart LR
    client[Client] --> gateway[Gateway]
    gateway --> retriever[Retriever]
    retriever --> embedder[Embedder]
    retriever -.lineage emit\ntimeout .-> marquez[(Marquez\n- unrelated, separate issue)]
    retriever --> chunks[(Postgres: chunks\n991 rows / 1 doc_id\nloaded once 2026-07-18)]
    gateway --> modelproxy[Model-proxy]

    style chunks fill:#5a1414,stroke:#e5533d,stroke-width:3px,color:#fff
    chunks -. ROOT CAUSE:\nsingle-document corpus caps\ntop-1 relevance at ~0.15\nvs 0.90 objective .-> gateway
```
