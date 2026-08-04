# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-04 19:22:45Z
- **Resolved:** 2026-08-04 19:32:45Z

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 18:35:19Z | k8s | Pod/gateway-5785654fc7-p97mq: Unhealthy |
| 18:38:48Z | k8s | Rollout/gateway: SkipSteps |
| 18:38:48Z | k8s | Rollout/gateway: RolloutUpdated |
| 18:38:49Z | k8s | Pod/gateway-5785654fc7-p97mq: Killing |
| 18:38:49Z | k8s | ReplicaSet/gateway-5785654fc7: SuccessfulDelete |
| 18:38:49Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:38:50Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulCreate |
| 18:38:50Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:38:50Z | k8s | Pod/gateway-dd85945b4-mm7jm: Scheduled |
| 18:38:53Z | k8s | Pod/gateway-dd85945b4-mm7jm: Started |
| 18:38:53Z | k8s | Pod/gateway-dd85945b4-mm7jm: Pulled |
| 18:38:53Z | k8s | Pod/gateway-dd85945b4-mm7jm: Created |
| 18:56:49Z | k8s | Rollout/gateway: RolloutUpdated |
| 18:56:49Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 18:56:49Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 18:56:50Z | deploy:argo | gateway synced to edb33a6699c9 |
| 18:56:50Z | k8s | Pod/gateway-dd85945b4-mm7jm: Killing |
| 18:56:50Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 18:56:50Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:56:51Z | k8s | ReplicaSet/gateway-8444846b5f: SuccessfulCreate |
| 18:56:51Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:56:51Z | k8s | Pod/gateway-8444846b5f-bqkg8: Scheduled |
| 18:56:52Z | k8s | Pod/gateway-8444846b5f-bqkg8: Pulled |
| 18:56:52Z | k8s | Pod/gateway-8444846b5f-bqkg8: Created |
| 18:56:53Z | k8s | Pod/gateway-8444846b5f-bqkg8: Started |
| 18:57:01Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 18:57:03Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 18:58:02Z | k8s | AnalysisRun/gateway-8444846b5f-21-1: MetricFailed |
| 18:58:02Z | k8s | AnalysisRun/gateway-8444846b5f-21-1: AnalysisRunFailed |
| 18:58:03Z | k8s | Rollout/gateway: RolloutAborted |
| 18:58:03Z | k8s | Rollout/gateway: AnalysisRunFailed |
| 18:58:04Z | k8s | Pod/gateway-8444846b5f-bqkg8: Killing |
| 18:58:04Z | k8s | ReplicaSet/gateway-8444846b5f: SuccessfulDelete |
| 18:58:04Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:58:05Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulCreate |
| 18:58:05Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 18:58:05Z | k8s | Pod/gateway-dd85945b4-hw5fg: Scheduled |
| 18:58:06Z | k8s | Pod/gateway-dd85945b4-hw5fg: Started |
| 18:58:06Z | k8s | Pod/gateway-dd85945b4-hw5fg: Pulled |
| 18:58:06Z | k8s | Pod/gateway-dd85945b4-hw5fg: Created |
| 19:01:45Z | deploy:annotation | deploy gateway via gitops c025382 (argo sync) |
| 19:01:47Z | deploy:argo | gateway synced to c025382ba170 |
| 19:01:47Z | k8s | Rollout/gateway: SkipSteps |
| 19:01:47Z | k8s | Rollout/gateway: RolloutUpdated |
| 19:22:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 19:22:13Z | log-spike | log-spike onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"de485c8c102fed457166dd54c36d5891","span_id":"add071294cfada41","time":"2026-08-04T19:22:13.792Z","reason":"The operation timed out.","job":"r… |
| 19:31:10Z | alert | alert resolved: SLO gateway latency — fast burn |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785871365914%22%2C+%22to%22%3A+%221785871965782%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785871365914%22%2C+%22to%22%3A+%221785871965782%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
2 deploy-window leads
- deploy annotation at 2026-08-04T19:01:45.359000+00:00: deploy gateway via gitops c025382 (argo sync)
- argo app platform: sync=OutOfSync health=Healthy (revision c025382ba170)

### kube_scan — LEAD
5 kube-scan leads
- event AnalysisRun/gateway-8444846b5f-21-1: MetricFailed — Metric 'canary-error-rate' Completed. Result: Failed (at 20:58:02)
- event AnalysisRun/gateway-8444846b5f-21-1: MetricFailed — Metric 'canary-p95' Completed. Result: Failed (at 20:58:02)
- event AnalysisRun/gateway-8444846b5f-21-1: AnalysisRunFailed — Analysis Completed. Result: Failed (at 20:58:02)
- event Rollout/gateway: RolloutAborted — Rollout aborted update to revision 21: Step-based analysis phase error/failed: Metric \"canary-error-rate\" assessed Failed due to failed (2) > fai… (truncated)
- event Rollout/gateway: AnalysisRunFailed — Step Analysis Run 'gateway-8444846b5f-21-1' Status New: 'Failed' Previous: 'Running' (at 20:58:03)

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"de485c8c102fed457166dd54c36d5891","span_id":"add071294cfada41","time":"2026-08-04T19:22:13.792Z","reason":"The operation timed out.","job":"rag.embed","eventType":"COMPLETE"} at 2026-08-04T19:22:13.793049+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"embedder","message":"lineage emit failed","trace_id":"de485c8c102fed457166dd54c36d5… (truncated)

### rollout_state — LEAD
1 rollout-state lead
- analysisrun for gateway (gateway-8444846b5f-21-1): Failed — Metric "canary-error-rate" assessed Failed due to failed (2) > failureLimit (1)

### secret_age — OK
Secret subject-db-credentials last modified 10d 20h ago (created 10d 20h ago).

</details>

## Narrative

## Summary

`SLO gateway latency — fast burn` (sev1, tenant acme) fired because gateway's p95 request latency repeatedly spiked to ~16.4s against a normal baseline of ~2ms. The spike was caused by synchronous OpenLineage emission calls made by gateway/retriever/embedder on every RAG request (`rag.inference`/`rag.retrieve`/`rag.embed` spans) blocking on an unreachable external lineage collector, timing out, and burning the 5m/1h SLO burn-rate windows. The alert cleared on its own once the dependency became reachable again; telemetry confirmed sustained recovery before this report was closed.

## Impact

Gateway p95 latency oscillated between ~7s and the observed 16.384s ceiling in repeated bursts, with elevated 5xx/error span rate on gateway riding along with it. Retriever and embedder p95 latency moved in lockstep (~7.2–7.8s), while model-proxy stayed flat at ~0.4s — showing the slowdown originated in the retriever/embedder/gateway lineage-emission path, not in the LLM call itself. Traffic volume was light (load-generator was scaled to 0 during this window), so blast radius was limited, but every request that did land during a burst window paid the full timeout cost.

## Root cause

Evidence chain, from telemetry only:

- `traces_spanmetrics_latency_bucket{service="gateway"}` (Mimir) shows p95 latency climbing from baseline into two distinct episodes: one at canary-analysis time, and a second, larger one that lines up almost to the second with this alert's onset — repeatedly pegging at exactly **16.384s**, a suspiciously round power-of-two number consistent with a client-side connect/read timeout ceiling, not organic slowness.
- Loki (`{namespace="subject"} |= "lineage emit failed"`) shows a flood of `warn` logs from **gateway**, **retriever**, and **embedder** simultaneously, each reading `"reason":"The operation timed out."`, wrapping `job:"rag.inference"|"rag.retrieve"|"rag.embed"` START/COMPLETE/FAIL events — i.e. every one of these calls pays a real network timeout on the request's critical path before completing.
- `kubectl describe configmap subject-telemetry -n subject` shows `MARQUEZ_URL: http://shahriar.tail813d2f.ts.net:5000` — an external, Tailscale-routed lineage collector outside the k3d cluster. `kubectl get svc -A` / `get pods -A` confirm there is **no Marquez workload anywhere in this cluster** — the sink is a single external dependency for all three services, with no fallback.
- CPU/memory on every subject pod is trivial (14–28m CPU, <130Mi of a 384Mi limit) — ruling out resource starvation or OOM.
- The bad canary deploy that Argo Rollouts auto-aborted (`gateway` rollout revision 21, image from gitops rev `edb33a6699c9`, hash `8444846b5f`, `AnalysisRun gateway-8444846b5f-21-1` failed on `canary-error-rate` 0.93 and `canary-p95` ~5s) is a **separate, earlier, already self-healed incident** — Argo's own canary analysis caught it and the fleet was back on the long-stable `dd85945b4` hash, restored via gitops revision `c025382`, well before this alert's onset.
- The `subject-telemetry` ConfigMap that carries `MARQUEZ_URL` was last actually applied by the `platform` Argo app on **2026-08-02** (`argo_app platform` deploy history, `syncedRevision 21f3422323b6`) — over 44 hours before this alert. No deploy, gitops sync, or config change coincides with this incident's onset, so the deploy-history "guilty until proven otherwise" lead is **ruled out** with evidence: this is a downstream-dependency reachability problem, not a bad release.

**Root cause: gateway, retriever, and embedder all make a synchronous OpenLineage "emit" call to an external, single-point-of-failure Marquez endpoint reachable only over Tailscale; when that endpoint stopped responding, every wrapped RAG request blocked until the client's own timeout (~16s), which is what burned the gateway latency SLO.**

## What fixed it

No in-cluster remediation tool applies here — there is no Marquez workload in this cluster to restart, the affected pods are healthy and unrelated to any deploy, and CPU/memory are nowhere near their limits, so a restart, scale, memory-limit patch, or rollout rollback would not have addressed an external network dependency and was correctly not performed (avoiding remediation theater on a healthy fleet, per the canary-abort runbook's own guidance). The episode was transient: repeated verification (`alert_status`, live Mimir p95/error-rate queries, and Loki checks for new `"lineage emit failed"` lines) showed the failures stopped, p95 returned to the ~2ms baseline, and `alert_status` flipped to inactive on its own once the external lineage sink became reachable again — recovery was observed and re-confirmed multiple times before closing, not assumed.

## Lessons

- Lineage emission (`rag.inference`/`rag.retrieve`/`rag.embed`) is on the synchronous request path in gateway, retriever, and embedder. It should be fire-and-forget (async, bounded queue) with a short timeout and a circuit breaker, so an unreachable Marquez cannot inflate the gateway latency SLO.
- `MARQUEZ_URL` pointing at a single external Tailscale host is a single point of failure for three production workloads with no fallback or in-cluster redundancy — worth revisiting as part of the cluster's own observability stack rather than an external dependency.
- No runbook matched `SLO gateway latency — fast burn` in `runbook_lookup`. This incident is a good candidate for a new runbook: check `traces_spanmetrics_latency_bucket` per service to localize the slow hop, then grep Loki for `"lineage emit failed"` before assuming a deploy regression.
- The concurrent, unrelated canary-abort event (revision 21) was a useful reminder to verify *which* incident the pre-check leads describe — timestamps and pod-template hashes disambiguated a already-self-healed deploy issue from the live, unrelated dependency-timeout issue actually driving the page.

```mermaid
flowchart LR
  client([client]) --> gateway[gateway]
  gateway --> retriever[retriever]
  gateway --> embedder[embedder]
  gateway --> modelproxy[model-proxy]
  retriever --> postgres[(postgres / pgvector)]
  gateway -. lineage emit .-> marquez{{external Marquez\nshahriar.tail813d2f.ts.net:5000\nvia Tailscale}}
  retriever -. lineage emit .-> marquez
  embedder -. lineage emit .-> marquez
  modelproxy -. unaffected, p95 0.4s .-> llmupstream[[llm upstream]]

  style marquez fill:#7a1f1f,stroke:#ff4d4d,stroke-width:3px,color:#fff
  linkStyle 4 stroke:#ff4d4d,stroke-width:3px
  linkStyle 5 stroke:#ff4d4d,stroke-width:3px
  linkStyle 6 stroke:#ff4d4d,stroke-width:3px
```

The broken hop is the dashed **lineage emit** edge from gateway/retriever/embedder out to the external Marquez collector — that blocking, timing-out call is what shows up as gateway p95 latency and burns the SLO, even though gateway's own downstream RAG/LLM path (solid edges) stayed healthy throughout.
