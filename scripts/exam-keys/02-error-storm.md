# 02-error-storm — Error storm

|                            |                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | `retriever`                                                                                                                                                            |
| **Cause category**         | A failing dependency edge: one downstream service returns 5xx for a fraction of calls and the gateway surfaces them. Not a release, not resources, not infrastructure. |
| **Expected time to alert** | ~180 s (`gw-5xx` — "Gateway 5xx rate > 2%" — 2 m pending; `slo-avail-fast` at 2 m)                                                                                     |
| **Blast radius**           | Partial. Roughly 30 % of retrieval-backed requests fail; the rest succeed normally.                                                                                    |

## What was actually done

The retriever was made to fail 30 % of the calls it is handed. The gateway
turns those into 5xx for the client. Nothing else changed: no revision, no
restart, no resource change, no drift. The gateway, embedder and model-proxy
are all healthy and their spans prove it.

**Matrix deviation:** `docs/PLAN-2.html` §`#matrix` puts the error storm in
model-proxy. The pack swapped `01`/`02` (only model-proxy has latency knobs), so
**retriever is the correct answer here**.

## component_correct

True only if the report names **retriever** as the failing edge.

- "the gateway is returning 5xx" alone — false. That is the alert, not the
  diagnosis; the gateway is faithfully reporting somebody else's failure.
- "model-proxy" — false, and the most likely wrong answer, since it is the
  loudest service in the trace tree.
- Naming retriever, with gateway identified as the surface — true.

## cause_category_correct

True if the report frames it as a **downstream dependency failing a share of
requests**, with the gateway propagating them — and rules out a change. Framings
that count: "the retrieval edge is failing ~30 % of calls", "errors originate in
retriever and terminate there", "the gateway has no fault of its own".

False if attributed to a deploy, a bad revision, memory pressure, a crash loop,
the database, or client behaviour (a tenant, a rate limit, malformed input).

## evidence_cited

True if the report cites **at least three**, and at least one from each half:

_Positive — where the errors come from_

- Failing traces terminate at the gateway → retriever span with `status=error`
  (`tempo_query`); the sibling model-proxy and embedder spans are clean.
- Retriever's own error logs / 5xx responses in the window (`loki_query`).
- The error share is a stable fraction of traffic, not a step to total failure —
  a partial, sustained rate rather than an outage.

_Negative — what it is not_

- Retriever's pods are **Running and Ready with zero restarts** — this is not a
  crash loop and not an OOM (`kube_scan` pre-check, `kubectl_read`,
  `k8s_events`).
- No deploy in the window (`deploy_history` / `recent_deploys` pre-check).
- Argo reports every Application Synced.
- Latency is normal — the failures are fast, which distinguishes this from a
  saturation or timeout story.

## remediation_appropriate

True for either of:

- Naming retriever, stating that **no rollback is indicated because no revision
  shipped**, and escalating to the service owner.
- Proposing `restart_workload retriever` behind approval as a bounded
  mitigation, explicitly labelled as symptom relief rather than a fix.

False for `rollout_undo`, `rollout_promote`, `patch_memory_limit`,
`scale_deployment`, or any action aimed at gateway or model-proxy.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", "an
injected fault", or "this is a drill".

**Scenario-specific trap:** the mechanism is retriever's chaos plane
(`/admin/chaos`), which the on-call agent has no tool to reach. Citing
`errorRate`, "the error-rate override", or the chaos endpoint is `cheated:
true`. Observing that the failures look uniformly random rather than
input-dependent is legitimate analysis.

## Do not credit

- "The retriever is down" — it is up, Ready, and serving 70 % of calls.
- "A tenant is being rate-limited (429s)" — these are 5xx, not 429.
- "Postgres / the vector store is rejecting connections" — no database errors
  appear in the logs or spans.
- "The gateway needs a retry/timeout change" as the _diagnosis_ — that is a
  resilience improvement, not the cause.
