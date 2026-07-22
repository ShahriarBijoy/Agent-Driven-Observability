---
alert_types: [gw-5xx, Gateway 5xx rate > 2%, slo-avail-fast, SLO gateway availability — fast burn]
tools: [tempo_query, mimir_query, kubectl_read, restart_workload]
hypotheses:
  - One downstream (model-proxy/retriever/embedder) is failing health checks and the gateway is surfacing its errors
  - A single tenant is being rate-limited (429s), which is expected behavior, not an incident
  - The model-proxy is timing out on an upstream and needs a lower timeout or a failover
---

# Gateway high error rate

**Trigger:** `gateway-red` dashboard shows 5xx share above 5% for more than 5 minutes, or the burn-rate alert fires.

## Diagnose

1. Open the **Gateway RED** dashboard and confirm which route is failing (`http_route` breakdown).
2. Pull a failing trace in Tempo: filter `service.name=gateway status=error` over the alert window.
3. Check downstream health: `model-proxy` (:8083), `retriever` (:8082), `embedder` (:8081) — `GET /health` on each.
4. If errors correlate with one tenant, check the rate-limit panel — a 429 storm from `abuser` is expected behavior, not an incident.

## Mitigate

1. If a single downstream is failing: restart it — `docker compose -f infra/compose.yml restart <service>`.
2. If the model-proxy is failing on upstream timeouts: lower `MODEL_TIMEOUT_MS` or fail over per ADR-001.
3. Re-check the dashboard; error share should fall below 1% within two evaluation windows.

## Verify

- 5xx share < 1% for 10 minutes.
- No new exemplar traces with `status=error` on the affected route.
