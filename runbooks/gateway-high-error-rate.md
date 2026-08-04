---
alert_types: [gw-5xx, Gateway 5xx rate > 2%, slo-avail-fast, SLO gateway availability — fast burn]
tools: [mimir_query, tempo_query, kubectl_read, restart_workload]
hypotheses:
  - The gateway is only the front door — a downstream (model-proxy/retriever/embedder) is failing and the gateway surfaces its errors
  - A single tenant is being rate-limited (429s), which is expected behavior, not an incident
  - The gateway itself is at fault — the hypothesis that survives only if the errors attribute to its own responses
---

# Gateway high error rate

**Trigger:** the gateway 5xx alert, or the availability burn-rate alert.

Every request enters through the gateway, so _every_ downstream failure reaches
a human as "gateway 5xx". Attribute the errors before explaining them: the first
question is not why the gateway is failing, it is **whose failure this is**.

## Diagnose

1. **By service**, before forming a hypothesis. A service returning 5xx from its
   own handlers indicts itself:

   ```promql
   100 * sum by (service) (rate(request_duration_seconds_count{http_status_code=~"5.."}[10m]))
     / clamp_min(sum by (service) (rate(request_duration_seconds_count[10m])), 0.001)
   ```

2. **By dependency edge.** A workload that is down emits no server-side series at
   all and ranks nowhere in step 1 — its callers are the only witnesses. Client
   span names are `<METHOD> <peer>`, so a hot row names the failing hop:

   ```promql
   100 * sum by (service, span_name) (rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_CLIENT", status_code="STATUS_CODE_ERROR"}[10m]))
     / clamp_min(sum by (service, span_name) (rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_CLIENT"}[10m])), 0.001)
   ```

3. **One failing trace** — `tempo_query`, `service.name=gateway status=error`. The
   _deepest_ errored span is where the failure started; the ones above it are
   reporting it. Then `kubectl_read get pods -n subject` on whatever steps 1-2 named.

4. **Shape:** a steady fraction failing = partial failure in one dependency, not
   an outage; one route or tenant = config or quota; 429s on `abuser` = rate
   limiting working as intended.

## Mitigate

Act where the errors originate, not at the front door where they surfaced.

- Downstream wedged: `restart_workload <it>`; if a rollout caused it, `rollout_undo`.
- Resources (OOMKill, throttling): `patch_memory_limit` or `scale_deployment` on
  that workload, not on the gateway.
- The gateway itself: only if step 1 blamed its own responses.
- Restarting the gateway to clear a downstream's errors destroys the evidence and
  they come back. Say so in the report rather than doing it.

## Verify

Step 1's query below 1% for 10 minutes **for the service you fixed**, the step-2
edge quiet, and the alert resolved without a second restart.
