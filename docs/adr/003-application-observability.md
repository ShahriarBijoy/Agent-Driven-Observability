# ADR-003 — Application observability (Phase 2)

Status: accepted · Date: 2026-06-02 · Supersedes: none · Related: [ADR-001](./001-monorepo-and-vertical-slices.md), [ADR-002](./002-subject-system.md), `docs/PLAN.html#p2`

This document is **both** an architecture decision record and the **build
specification** for Phase 2. Every implementation agent codes against it. If
something here conflicts with intuition, this document wins; if something is
genuinely missing, extend this document before writing code.

---

## 1. Decisions

1. **Manual instrumentation, not auto-instrumentation.** The services run on
   **Bun**. Bun's native `fetch`/`Bun.serve` are not the Node `http` module that
   `@opentelemetry/auto-instrumentations-node` patches, and Bun does not
   implement the ESM module-customization hooks those instrumentations rely on.
   The OTel SDK init runs with `instrumentations: []`. All spans/metrics/logs
   come from shared helpers in `@obs/telemetry`. This is a deliberate deviation
   from the plan's "auto-instrumentation picks up Hono/fetch/pg/ioredis".

2. **The OTel SDK itself works on Bun.** `NodeSDK` with OTLP/HTTP exporters runs
   fine; we explicitly pin `AsyncLocalStorageContextManager` +
   `W3CTraceContextPropagator` for deterministic context propagation.

3. **Exemplars come from Tempo's metrics-generator, not the app.** OTel-JS
   `sdk-metrics@2.7.1` does **not** wire metric exemplars (the classes exist but
   are not exported/driven; `OTEL_METRICS_EXEMPLAR_FILTER` is a no-op — upstream
   issue open-telemetry/opentelemetry-js#5147). So we do not attempt app-side
   exemplars. Instead, Tempo's metrics-generator emits `traces_spanmetrics_*`
   (RED, with exemplars) and `traces_service_graph_*` and remote-writes them to
   Mimir. The **Gateway RED dashboard** and the exemplar drill-down are built on
   these span-metrics; app histograms (`request_duration_seconds`) remain useful
   for per-route RED but carry no exemplars.

4. **Metrics take the OTLP-direct path to Mimir.** Alloy's
   `otelcol.exporter.prometheus` → `prometheus.remote_write` chain drops OTLP
   exemplars during conversion. We use `otelcol.exporter.otlphttp` →
   `http://mimir:9009/otlp` so exemplars survive (and to keep OTel metric
   semantics). Tempo's generator uses Mimir remote-write (`/api/v1/push`) for its
   span-metrics — that path keeps exemplars because it never touches the OTLP→Prom
   converter.

5. **Pinned image + package versions** (verified 2026-06-02). Packages: OTel
   stable `2.7.1`, experimental `0.218.0`, api `1.9.1`, semconv `1.41.1` (keep
   `@opentelemetry/api` < 1.10.0). Images: `grafana/alloy:v1.16.2`,
   `grafana/loki:3.7.2`, `grafana/tempo:3.0.0`, `grafana/mimir:3.1.0`,
   `grafana/grafana:13.0.1`.

6. **One OTLP ingress: Grafana Alloy.** Services never talk to Loki/Tempo/Mimir
   directly. They export OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT` (=
   `http://alloy:4318` in compose). Alloy batches and fans out.

7. **Telemetry is centralized in `@obs/telemetry`.** No service imports
   `@opentelemetry/*` directly; the package re-exports the slice of the API that
   application code needs. This keeps the dependency graph clean and the
   instrumentation consistent across the fleet.

---

## 2. The `@obs/telemetry` public API — the contract

`packages/telemetry` is **fully implemented** and is the reference. Read its
source first. Public surface (from `packages/telemetry/src/index.ts`):

```ts
// SDK lifecycle (call once, first thing, via src/platform/telemetry.ts)
initTelemetry(service: { name: string; version: string }): void
serviceInfo(): { name: string; version: string }

// Tracing
getTracer(name?): Tracer
withSpan<T>(name, fn: (span) => Promise<T>|T, opts?: { kind?, attributes?, tracer? }): Promise<T>
activeTraceIds(): { traceId?, spanId? }
SpanKind, SpanStatusCode, trace, context           // re-exported OTel API
type Span, type Attributes, type SpanOptions

// Metrics
getMeter(name?): Meter
createHistogram(meter, name, { description?, unit?, boundaries }): Histogram  // explicit buckets via advice
type Counter, Histogram, UpDownCounter, Meter

// Logging (JSON to stdout + OTel LogRecord, both carry trace_id/span_id)
createLogger(service: string): AppLogger  // .debug/.info/.warn/.error(msg, attrs?)

// HTTP instrumentation
honoTelemetry(serviceName: string): MiddlewareHandler  // SERVER span + RED metrics + context extract
tracedFetch(input, init?, opts?): Promise<Response>    // CLIENT span + traceparent inject (drop-in fetch)
```

`honoTelemetry` already emits the fleet-wide RED metrics for **every** service:
`request_duration_seconds` (histogram, seconds, buckets
`[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10]`, labels
`service,http_route,http_method,http_status_code`) and `active_requests`
(UpDownCounter, label `service`). Do **not** re-create these per service.

---

## 3. Per-service wiring (apply to gateway, retriever, model-proxy)

`apps/embedder` is the **implemented reference** for the wiring. Mirror it:

1. Create `src/platform/telemetry.ts`:
   ```ts
   import { initTelemetry } from "@obs/telemetry";
   initTelemetry({ name: "<service>", version: "0.0.0" });
   ```
2. Make it the **first import** in `src/main.ts`:
   ```ts
   import "./platform/telemetry"; // initialises OpenTelemetry before any app code
   ```
3. In `src/platform/http.ts`, import `honoTelemetry` and mount it as the **first
   middleware** in `createApp`, immediately after `new OpenAPIHono(...)`:
   ```ts
   app.use("*", honoTelemetry(serviceName));
   ```

Do not touch slice/business logic for the non-gateway services beyond this — the
server spans, RED metrics, and trace-context propagation come for free.

---

## 4. Gateway specifics

### 4a. Outbound client spans + trace propagation

In `apps/gateway/src/platform/upstream.ts`, replace the bare `fetch(...)` call in
`createUpstreamClient.postJson` with `tracedFetch(...)` from `@obs/telemetry`,
passing a span name based on the client `name` (e.g. `POST <name>`). Everything
else (timeout via `AbortSignal.timeout`, error mapping) stays identical.
`tracedFetch` injects `traceparent`, so the embedder/retriever/model-proxy SERVER
spans continue the same trace → this is what makes the **service map** edges
appear.

### 4b. Manual RAG spans

In `apps/gateway/src/slices/inference/service.ts`, wrap the flow in named spans
using `withSpan`. The chat is one parent span with three children:

| Span           | Wraps                                                            | Kind     |
| -------------- | ---------------------------------------------------------------- | -------- |
| `rag.retrieve` | `embedder.embed(prompt)` + `retriever.retrieve(embedding, topK)` | INTERNAL |
| `rag.augment`  | building the context from chunk bodies                           | INTERNAL |
| `rag.generate` | `model.complete(prompt, context)`                                | INTERNAL |

Attributes to attach (use the active span / span args):

- on `rag.retrieve` (and/or parent): `tenant`, `prompt.hash` (sha-256 hex of
  prompt, or a short stable hash), `rag.top_k`, `rag.retrieved_doc_ids` (array of
  `chunk.docId`).
- on `rag.generate`: `gen.model` (= `completion.model`).

Keep the spans thin — they wrap the existing calls; do not change behavior.

### 4c. Custom metrics (gateway only — RED already covered fleet-wide)

Create a `apps/gateway/src/platform/metrics.ts` (or a small slice helper) using
`getMeter("gateway")` + `createHistogram`:

| Metric                        | Type                                 | Labels            | Notes                                                                                  |
| ----------------------------- | ------------------------------------ | ----------------- | -------------------------------------------------------------------------------------- |
| `tokens_in_total`             | Counter                              | `tenant`, `model` | add `completion.usage.promptTokens`                                                    |
| `tokens_out_total`            | Counter                              | `tenant`, `model` | add `completion.usage.completionTokens`                                                |
| `rate_limit_rejections_total` | Counter                              | `tenant`          | inc in rate-limit middleware before throwing                                           |
| `retrieval_relevance_score`   | Histogram                            | —                 | buckets `[0,0.1,...,1.0]`; record each `chunk.score`                                   |
| `cache_hit_ratio`             | Histogram                            | —                 | buckets `[0,0.25,0.5,0.75,1]`; record `1` on cache hit, `0` on miss (mean = hit ratio) |
| `active_requests`             | (already emitted by `honoTelemetry`) | —                 | do not duplicate                                                                       |

`rate_limit_rejections_total` increments in
`apps/gateway/src/slices/rate-limit/middleware.ts` at the point `RateLimitedError`
is thrown (label `tenant`).

### 4d. Structured logs

Swap the gateway's `console.*` calls (e.g. the usage-write-failure log, the
startup line) for a `createLogger("gateway")` instance so logs carry
`trace_id`/`span_id`. Other services may keep `console.*`; the gateway is the one
the acceptance criteria exercise.

---

## 5. Infrastructure

### 5a. Backend configs (implemented — see files)

- `infra/loki/loki.yaml` — single binary, filesystem, structured metadata on.
- `infra/tempo/tempo.yaml` — local storage, OTLP receivers, metrics-generator
  (`span-metrics` + `service-graphs`) remote-writing to Mimir.
- `infra/mimir/mimir.yaml` — monolithic, filesystem, exemplars enabled, accepts
  OTLP + remote-write.
- `infra/alloy/config.alloy` — OTLP in (gRPC+HTTP) → batch → Tempo (otlp),
  Mimir (otlphttp `/otlp`), Loki (otlphttp `/otlp`).

### 5b. Compose wiring (fan-out work)

- `infra/compose.observability.yml` adds `alloy, loki, tempo, mimir, grafana` on
  the `obs` network (alloy/loki/tempo/mimir implemented; **add grafana**).
- In `infra/compose.yml`, every TS service (gateway, embedder, retriever,
  model-proxy, seed, load-generator) must (a) join the `obs` network in addition
  to `app`, and (b) get `OTEL_EXPORTER_OTLP_ENDPOINT: http://alloy:4318` and
  `OTEL_SERVICE_NAME` / metric-interval env as needed. Add `obs` to the
  top-level `networks:` of compose.yml if not present (it is).

### 5c. Grafana (fan-out work)

- `infra/grafana/provisioning/datasources/datasources.yaml` — Mimir (prometheus,
  uid `mimir`, `exemplarTraceIdDestinations`→tempo), Loki (uid `loki`,
  `derivedFields` trace_id→tempo), Tempo (uid `tempo`, `tracesToLogsV2`→loki,
  `serviceMap`→mimir, `nodeGraph` on).
- `infra/grafana/provisioning/dashboards/dashboards.yaml` — provider pointing at
  the dashboards dir.
- Grafana service in compose: `grafana/grafana:13.0.1`, port `3001:3000`
  (3000 is taken on host by convention; map to 3001), env
  `GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Admin`,
  provisioning mounted read-only.

### 5d. Dashboards (fan-out work)

- `gateway-red.json` — 3 rows from **Tempo span-metrics** in Mimir: rate
  (`sum by (span_name) (rate(traces_spanmetrics_calls_total{service="gateway"}[1m]))`),
  errors (5xx/4xx ratio), duration p50/p95/p99 (`histogram_quantile` over
  `traces_spanmetrics_latency_bucket`) **with the exemplars toggle on**.
- `rag-pipeline.json` — from **app metrics**: token throughput
  (`rate(tokens_*_total[1m])`), `cache_hit_ratio`, `retrieval_relevance_score`
  heatmap, `rate_limit_rejections_total` over time, top tenants by token usage.

### 5e. Alerts (fan-out work)

`infra/grafana/provisioning/alerting/` — two rules, contact point `agent-webhook`
(placeholder URL, wired in Phase 5):

1. gateway 5xx rate > 2% for 2m.
2. gateway p95 latency > 2s for 5m.

---

## 6. Acceptance & verification

Live verification is run from the host against backend APIs (Grafana UI exemplar
click is the human sign-off):

- Trace present in Tempo: `GET http://localhost:3200/api/search?tags=service.name=gateway`.
- Metric present in Mimir: `GET http://localhost:9009/prometheus/api/v1/query?query=request_duration_seconds_count` and `traces_spanmetrics_calls_total`.
- Log with trace_id in Loki: `GET http://localhost:3100/loki/api/v1/query_range?query={service_name="gateway"}` and confirm `trace_id` structured metadata.
- Service graph: `traces_service_graph_request_total` present in Mimir.

Plan acceptance: Grafana shows live RED for the gateway; RAG dashboard populates
under load; Service Map shows gateway → {embedder, retriever, model-proxy};
exemplar → Tempo trace → Loki logs loop works; both alert rules exist.
