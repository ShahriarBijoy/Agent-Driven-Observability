# @obs/gateway

The public HTTP gateway for the AI Observability Lab. It authenticates tenants,
rate-limits per tenant, orchestrates the RAG flow across the embedder, retriever,
and model-proxy, and meters usage. (Telemetry arrives in Phase 2 — plain
`console` logging only here.)

## Slices

- `auth/` — bearer-token middleware resolving a `Tenant` from the hardcoded dev
  registry; missing/invalid token → `401 { error: { code: "unauthorized" } }`.
- `rate-limit/` — per-tenant token bucket (`rl:<tenant>`) backed by an atomic
  Redis Lua script, with an in-memory adapter for tests; exhaustion →
  `429 { error: { code: "rate_limited" } }`.
- `inference/` — `POST /v1/chat` (embed → retrieve → complete → meter → respond)
  and `POST /v1/embed` (passthrough). Upstream calls share a client with an
  `AbortSignal.timeout`; timeout → `504 upstream_timeout`, model-proxy `429` →
  `429 model_overloaded`, any other upstream failure → `502 upstream_error`.
- `usage-metering/` — Drizzle `usage_events` table; one row per successful chat.
  A write failure is logged and never fails the request.

## Endpoints

- `GET /health`, `GET /doc` (shared platform).
- `POST /v1/chat` — `ChatRequest` → `ChatResponse`.
- `POST /v1/embed` — `GatewayEmbedRequest` → `GatewayEmbedResponse`.

See `.env.example` for configuration. Run with `bun run start` (or `bun run dev`).
