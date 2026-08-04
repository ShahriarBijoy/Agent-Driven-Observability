# Postmortem: gateway availability error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** open
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-08-04 13:39:44Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 13:39:10Z | alert | alert firing: SLO gateway availability — slow burn |
| 13:44:42Z | k8s | Rollout/gateway: RolloutUpdated |
| 13:44:42Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 13:44:43Z | k8s | Pod/gateway-dd85945b4-pwg4s: Killing |
| 13:44:43Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 13:44:43Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 13:44:43Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 13:44:44Z | k8s | ReplicaSet/gateway-865966ff97: SuccessfulCreate |
| 13:44:44Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 13:44:44Z | k8s | Pod/gateway-865966ff97-zhm57: Scheduled |
| 13:44:46Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:44:46Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:44:47Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:44:47Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:44:57Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:44:57Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:45:08Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:08Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:45:19Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:19Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:45:33Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:33Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:45:46Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:46Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:45:57Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:57Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:46:10Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:10Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:46:24Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:24Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:46:37Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:37Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:46:48Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:48Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:00Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:00Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:13Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:13Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:27Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:27Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:38Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:38Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:47:41Z | verification | recovery NOT verified — deadline armed |
| 13:47:49Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:49Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:03Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:48:03Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:16Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:48:16Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:31Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:48:31Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:44Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:56Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:10Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:21Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:35Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:48Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:49:48Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:54:47Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:54:47Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:55:31Z | k8s | Rollout/gateway: SkipSteps |
| 13:55:31Z | k8s | Rollout/gateway: RolloutUpdated |
| 13:55:32Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulCreate |
| 13:55:32Z | k8s | ReplicaSet/gateway-865966ff97: SuccessfulDelete |
| 13:55:32Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 13:55:32Z | k8s | Pod/gateway-dd85945b4-jfd54: Scheduled |
| 13:55:35Z | k8s | Pod/gateway-dd85945b4-jfd54: Started |
| 13:55:35Z | k8s | Pod/gateway-dd85945b4-jfd54: Pulled |
| 13:55:35Z | k8s | Pod/gateway-dd85945b4-jfd54: Created |
| 14:03:39Z | verification | recovery NOT verified — deadline armed |
| 14:13:49Z | deploy:ci | CI run #112 failure on main: obs: load-generator: drop the defensive copy in percentile() |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785850784314%22%2C+%22to%22%3A+%221785852948313%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785850784314%22%2C+%22to%22%3A+%221785852948313%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match:** none — no tool narrowing applied for this alert. Available runbooks: README.md, canary-abort.md, ci-pipeline-red.md, dq-freshness-stall.md, gateway-high-error-rate.md, k8s-crashloop.md, k8s-node-failure.md, snapshot-agent-audit.md, stale-secret.md

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — OK
error/failed log rate normal: 0/10min vs baseline 327/10min

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 16:08:11.592261     940 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 16:08:11.649584     940 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 16:08:11.729988     940 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 16:08:11.592803   63588 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 16:08:11.656599   63588 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Outcome: root cause confirmed with fresh telemetry, remediation approved but blocked by a persistent infra credential fault (attempt 3)

### Summary
Continuing incident inc_19fcd006a3780a (`SLO gateway availability — slow burn`, tenant=acme). Attempt 2's phantom-tag-canary theory is now stale: `kube_replicaset_status_ready_replicas`/`spec_replicas` (read via Mimir, since direct k8s API reads are still `Unauthorized`) show the offending canary ReplicaSet `gateway-865966ff97` at **0/0** replicas and the stable ReplicaSet `gateway-dd85945b4` fully healthy at **4/4** — that failure mode is over. Re-investigating from scratch found a different, better-supported cause for the sustained availability burn.

### Impact
Gateway `POST /v1/chat` served real 5xx/429s to legitimate traffic (confirmed on tenant=acme requests, not just the abusive tenant) in two bursts, peaking at ~23% and ~11% error-span ratio (`sum(rate(traces_spanmetrics_calls_total{service="gateway"}[5m])) by (status_code)`), each lasting several minutes — well above the runbook's 5% threshold — enough to burn ~10% of the 28d error budget in 6h per the alert annotation.

### Root cause
`model-proxy` rejects requests with a fast (~300–700µs) 429 `ModelOverloadedError` ("model is overloaded") once its request-rate/concurrency ceiling is hit — confirmed directly in Tempo (`{resource.service.name="model-proxy" && status=error}`) and propagated into gateway's `rag.generate`/`rag.chat` spans (exception `model_overloaded`, thrown in `apps/gateway/src/slices/inference/adapters/model-http.ts`). The limiter is **not tenant-isolated**: Tempo shows a dense burst of `tenant="abuser"` traffic exactly overlapping both error spikes, and the errored root spans include `tenant="acme"` — i.e. the abusive tenant's burst saturated a *shared* capacity ceiling and legitimate acme traffic was rejected as collateral. This matches the `gateway-high-error-rate` runbook's own diagnostic step ("if errors correlate with one tenant, check the rate-limit panel — a 429 storm from `abuser` is expected behavior") but goes further: because the limiter isn't per-tenant, the storm leaked into acme's error budget, which *is* an incident. `model-proxy` replica count held flat at 4/4 the entire window (`kube_replicaset_status_ready_replicas`) — no autoscaling occurred, so there was no capacity cushion. CI is green on `main` (last 5 runs all passed) and no deploy landed in the 60 minutes before alert onset, ruling out a bad rollout for this specific alert. The error-span ratio has independently dropped to 0% for the last ~10 minutes as the abuser burst subsided on its own, but nothing changed cluster-side to prevent recurrence.

### What fixed it
Proposed and got operator approval to scale `model-proxy` 4→6 replicas to add capacity headroom against tenant bursts. **Execution failed**: `scale_deployment(model-proxy, 6, dry_run=false)` returned the same `Unauthorized — You must be logged in to the server` that blocked every direct k8s read/write this session (`kubectl_read`, `rollout_status`, `argo_app`, and now the remediation write path too). This is the same systemic credential fault attempt 2 hit on `rollout_abort` — now confirmed on a second, unrelated mutating tool, which rules out "tool-specific bug" and confirms a cluster-wide agent-remediate credential outage. Re-queried `alert_status` after the failed execution: still active, unchanged since 13:39:10Z. I did not retry the identical scale action against the identical wall.

### Lessons
- The on-call tooling's k8s credential path (both `agent-ro` reads and the remediation write identity) has been down across at least two independent incident attempts and two unrelated mutating tools — this needs to be fixed out-of-band before any agent can remediate this cluster, and should probably page infra directly rather than surface only as a per-incident dry-run diff failure.
- Mimir (via kube-state-metrics) stayed a reliable read path throughout the credential outage and was the only way to confirm cluster/replica state this session — worth documenting as the fallback when `kubectl_read`/`argo_app`/`rollout_status` are down.
- `model-proxy`'s overload limiter should be tenant-scoped; a shared ceiling means any single noisy tenant can burn every other tenant's SLO budget. Recommend a follow-up to add per-tenant rate limiting on `model-proxy` and/or a dedicated `abuser`-class low-priority queue.

```mermaid
flowchart LR
    client[Client] --> gateway[gateway\nPOST /v1/chat]
    gateway --> retriever[retriever]
    gateway --> embedder[embedder]
    gateway -->|"rag.generate"| modelproxy["model-proxy\n⚠ shared rate limiter,\nno tenant isolation"]
    modelproxy -->|"429 model_overloaded\nunder tenant=abuser burst"| gateway
    retriever --> postgres[(postgres)]
    subgraph blocked[blocked remediation]
      oncall[on-call agent] -->|scale_deployment model-proxy 4→6| k8sapi["k8s API\n❌ Unauthorized\n(agent-remediate credential outage)"]
    end
    style modelproxy fill:#7a3b12,stroke:#e67e22,stroke-width:2px,color:#fff
    style k8sapi fill:#5a1414,stroke:#c0392b,stroke-width:2px,color:#fff
```

Chart artifact: `report.html` (error-span ratio over the incident window, both bursts and the recovery to 0%).
