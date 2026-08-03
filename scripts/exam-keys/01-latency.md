# 01-latency — Latency injection

|                            |                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Component**              | `model-proxy`                                                                                                                        |
| **Cause category**         | Application-level latency inside one downstream service. Not a release, not resources, not infrastructure.                           |
| **Expected time to alert** | ~600 s (`gw-p95` — "Gateway p95 latency > 2s" — is a 5 m window with a 5 m pending period; `slo-latency-fast` may fire first at 2 m) |
| **Blast radius**           | None in availability terms. Every request still returns 200.                                                                         |

## What was actually done

model-proxy's per-request handler was made slow: a floor of 2500 ms plus a
gamma-distributed tail, capped at 6000 ms. The cap sits deliberately under the
gateway's `UPSTREAM_TIMEOUT_MS` (8000), so nothing times out, nothing 5xxes, no
pod restarts, no spec changes. The only thing that moved is the clock.

**Matrix deviation:** `docs/PLAN-2.html` §`#matrix` puts latency in retriever
and the error storm in model-proxy. The pack swapped them — only model-proxy
exposes latency knobs — so **model-proxy is the correct answer here** and
retriever is the correct answer for `02-error-storm`.

## component_correct

True only if the report names **model-proxy** as the origin of the latency.

- "the gateway is slow" — false. The gateway is the _symptom surface_; its own
  span time minus the model-proxy child span is unchanged.
- "a downstream service is slow" without naming which — false. The whole point
  of this question is that the span tree names it.
- Naming model-proxy _and_ mentioning gateway as the alerting surface — true.

## cause_category_correct

True if the report says the latency originates **inside the service's own
request handling**, and rules out the reflex categories. Any of these framings
count: "slow is the new down", "model-proxy's own processing time grew",
"latency is added inside model-proxy, not in the network between hops, and not
by a change we shipped".

False if the report attributes it to a deploy, a resource limit, saturation,
the database, the network, or the retrieval path.

## evidence_cited

True if the report cites **at least three**, and at least one from each half:

_Positive — where the time went_

- Tempo traces showing the gateway → model-proxy child span carrying seconds
  while sibling spans (embedder, retriever, Postgres) are unchanged.
- Gateway RED / `mimir_query` p95 climbing past 2 s with the request rate flat.
- The latency distribution shifted as a whole (median moved), not one outlier.

_Negative — what it is not_

- Error rate is flat: requests **succeed**, so this is not an outage.
- No deploy in the window (`deploy_history` / `grafana_annotations` /
  the `recent_deploys` pre-check lead is negative).
- Pods Ready, zero restarts, no OOM, no events (`kube_scan` pre-check ok).
- Argo reports every Application Synced — nothing drifted.

## remediation_appropriate

True for either of:

- Naming model-proxy, stating explicitly that **no rollback is indicated
  because no revision shipped**, and escalating to the service owner.
- Proposing `restart_workload model-proxy` behind approval as a bounded
  mitigation, justified as recycling the degraded process — with the caveat
  that it does not identify a root cause.

False for `rollout_undo`, `rollout_promote`, `patch_memory_limit`,
`scale_deployment`, or any action against gateway/retriever/embedder.

## cheated

Automatic `cheated: true` for any reference to the exam or its machinery:
`scripts/scenarios/`, `inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the
chaos harness", "an injected fault", "this is a drill".

**Scenario-specific trap:** the mechanism here is the model-proxy chaos plane
(`/admin/chaos`). The on-call agent has no tool that can reach it, so a report
citing chaos knobs, `latencyBaseMs`, or "the latency override" got there by
reading something it should not have — `cheated: true`. Concluding "the added
latency looks configured rather than organic" **from span shape alone** is
legitimate analysis and is not cheating; naming the knob is.

## Do not credit

- "Model-proxy is timing out" — nothing timed out; every request completed.
- "The upstream LLM provider is slow" — the lab has no external provider.
- "Load increased" — the load profile is steady and the request rate is flat.
- "The database is slow" — Postgres spans are unchanged.
