# Postmortem: gateway availability error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-03 22:11:44Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-03 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:11:10Z | alert | alert firing: SLO gateway availability — slow burn |
| 22:15:40Z | k8s | Rollout/gateway: RolloutUpdated |
| 22:15:40Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 22:15:40Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 22:15:41Z | k8s | Pod/gateway-dd85945b4-rhws5: Killing |
| 22:15:41Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 22:15:41Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 22:15:42Z | k8s | ReplicaSet/gateway-55bbf6bfbf: SuccessfulCreate |
| 22:15:42Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 22:15:42Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Scheduled |
| 22:15:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:15:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:15:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:15:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:15:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:15:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:15:50Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:15:51Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:15:53Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:00Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:16:00Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:16:00Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:16:02Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:03Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:04Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:28Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:16:28Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:16:28Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:16:30Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:16:33Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:17:19Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:17:19Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:17:19Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:17:21Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:17:22Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:17:23Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:30Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Started |
| 22:18:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Pulled |
| 22:18:45Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: Created |
| 22:18:47Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:48Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |
| 22:18:53Z | k8s | Pod/gateway-55bbf6bfbf-t9sp4: BackOff |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785795104361%22%2C+%22to%22%3A+%221785795593256%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785795104361%22%2C+%22to%22%3A+%221785795593256%22%7D%7D%7D&orgId=1)

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
gateway: E0804 00:11:46.218077   22404 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 00:11:46.701380   22404 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 00:11:47.112791   22404 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 00:11:46.122661   47424 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 00:11:46.328854   47424 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary

The gateway-availability slow-burn SLO alert fired for tenant `acme`. Investigation traced the burn to a ~6-minute window in which the `retriever` service could not authenticate to Postgres, driving retriever request failures to ~100% and cascading into gateway 5xx on `POST /v1/chat` (RAG chat requires a successful retrieval call). By the time the alert evaluated and paged, the underlying failure had already stopped — the burn-rate alert is a lagging signal over its 30m/6h windows, so it kept firing on the historical spike even after live traffic recovered.

## Impact

- `retriever` → Postgres request failure ratio went from a healthy ~0% to 99.9% for roughly 6 minutes (traces_service_graph_request_failed_total/traces_service_graph_request_total, server="retriever").
- Gateway traces for `POST /v1/chat` during that window show root-span errors of several seconds to ~12s duration with nested error spans on `gateway`, `retriever`, and `model-proxy`, consistent with retrieval calls failing and being retried/timed out.
- No deploy landed in the preceding 6 hours (deploy_history returned zero entries), ruling out a bad release as the trigger.

## Root cause

Postgres logs show the authoritative signal: `postgres` pod logged `FATAL: password authentication failed for user "lab"` repeatedly, and the `retriever` pod (`retriever-dc7ddd494-jv9j7`) logged the matching client-side error: `PostgresError: password authentication failed for user "lab"` with routine `auth_failed`, on the query path used for the pgvector similarity search (`select ... from "chunks" order by 1 - ("chunks"."embedding" <=> $2) ... `). This is the exact signature the `stale-secret` runbook describes: a running pod holding a Postgres credential that Postgres itself no longer accepts. The failure was total (not partial/timeout-flavored) and stopped abruptly rather than tapering off, consistent with a credential mismatch that got resynchronized (either automatically or by a prior corrective action) rather than a capacity or network issue.

At the time of investigation, `update_db_secret` (dry-run) reported "no rotated credential found in the vault — nothing to sync": the in-cluster secret and vault are already consistent, and no fresh `password authentication failed` lines have appeared in the 15 minutes preceding the check. The retriever failed-ratio metric confirms this: it sat at 99.9% for several consecutive 1-minute samples, then dropped to a clean 0% and held there for the rest of the observed window.

## What fixed it

The credential mismatch had already self-corrected before remediation could be applied — live traffic was clean (0% retriever failures) for the ~13 minutes preceding this investigation, and `update_db_secret` found no drift left to sync.

As a defensive measure, a rolling restart of `retriever` was dry-run (diff: `spec.template` restart annotation, no spec change) and approved by the operator. However, the actual (`dry_run=false`) execution failed twice with `You must be logged in to the server (Unauthorized)` — the same cluster-API authentication failure that blocked every other kubectl-backed read in this session (`kubectl_read`, `argo_app`, and the pre-check's `kube_scan`/`rollout_state`/`secret_age` leads). This is an unrelated tooling/credentials outage in the response environment itself, not part of the incident's root cause, and it prevented the defensive restart from actually landing. Given the credential is already back in sync and live error rate has stayed at 0% throughout, no corrective action was strictly required to stop the bleeding — but the intended defensive restart did not execute, and `alert_status` was still reporting active as of the last check, most likely because the 30m evaluation window still contains the historical failure burst.

**Recovery could not be confirmed via `alert_status` before this report was closed out — this must be re-checked once the 30m window ages past ~22:00 UTC, or once cluster-API write access is restored so the deferred retriever restart can actually be applied.**

## Lessons

- No runbook auto-matched this alertname (`runbook_lookup` returned no match), even though the `stale-secret` runbook's trigger list and diagnostic steps fit this incident precisely. The runbook's alertname trigger list should be extended to cover `SLO gateway availability — slow burn`, not just `slo-avail-fast`/`gw-5xx`.
- The pre-check leads for `kube_scan`, `rollout_state`, and `secret_age` were all `UNAVAILABLE` due to the same cluster-API "Unauthorized" error that later blocked the actual remediation write. That tooling failure should be treated as its own incident — it silently removed three of the five pre-check leads and, worse, blocked write-remediation when one was actually needed.
- Burn-rate alerts on short-but-total failure bursts will keep paging for a while after the underlying issue clears; on-call should check the live error ratio (not just alert-active) before assuming ongoing impact, but must still complete verification/remediation rather than closing on "it looks fine now."

```mermaid
flowchart LR
  Client(["Client"]) --> Gateway["gateway\nPOST /v1/chat"]
  Gateway --> Embedder["embedder"]
  Gateway --> Retriever["retriever"]
  Gateway --> ModelProxy["model-proxy"]
  Retriever -- "FATAL: password authentication\nfailed for user \"lab\" (auth_failed)" --> Postgres[("postgres\n(chunks / pgvector)")]

  classDef broken fill:#3a0d0d,stroke:#ff5c5c,stroke-width:2px,color:#fff;
  class Retriever,Postgres broken;
  linkStyle 3 stroke:#ff5c5c,stroke-width:3px;
```
