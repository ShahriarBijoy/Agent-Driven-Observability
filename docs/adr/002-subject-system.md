# ADR-002 — The subject system (Phase 1)

Status: accepted · Date: 2026-05-31 · Supersedes: none · Related: [ADR-001](./001-monorepo-and-vertical-slices.md), `docs/PLAN.html#p1`

This document is **both** an architecture decision record and the **build
specification** for Phase 1. It is the single source of truth that every
implementation agent codes against. If something here conflicts with intuition,
this document wins; if something is genuinely missing, extend this document
before writing code.

---

## 1. Decisions

1. **Drizzle ORM + postgres.js** for all Postgres access (matches the documented
   stack). pgvector cosine search uses Drizzle's `cosineDistance`.
2. **Corpus seed downloads a pinned public-domain text** by URL, verifies a
   SHA-256 checksum, and chunks it deterministically. If the download fails, it
   falls back to a **deterministic generated corpus** so the lab never hard-fails
   offline (a resilience addition to the plan).
3. **Vertical-slice DDD** exactly as in `docs/PLAN.html#slice`. Each feature owns
   `domain/`, `ports/`, `adapters/`, `handlers/`, and a `slice.ts` mount point.
4. **No telemetry yet.** No OpenTelemetry, no metrics, no tracing. That is Phase 2.
   Plain `console.*` logging only.
5. **The deterministic fake embedder** (`hashEmbedding` in `@obs/domain`) is the
   one and only embedding function. The embedder service and the seed script both
   import it — never reimplement it. This guarantees seed/query agreement.
6. **IVFFlat index is created by the seed script after data load** (so it trains
   on real vectors), not in the init SQL. The init SQL creates the extension and
   tables only.

---

## 2. Canonical reference — copy this pattern

`apps/embedder` is **fully implemented** and passing tests. **Read it first** and
mirror its structure, naming, and idioms precisely:

```
apps/embedder/
├── src/
│   ├── platform/
│   │   ├── config.ts        # zod env schema → typed Config (camelCase)
│   │   ├── errors.ts        # AppError + toErrorResponse + HttpStatus union
│   │   └── http.ts          # createApp(name): OpenAPIHono (health, /doc, onError, defaultHook)
│   ├── slices/
│   │   ├── cache/           # supporting slice: ports/ + adapters/ + index.ts factory
│   │   └── embed/
│   │       ├── service.ts            # pure logic, dependency-injected
│   │       ├── handlers/embed.ts     # createRoute(...) + app.openapi(...)
│   │       ├── slice.ts              # mount point: builds service, registers routes
│   │       └── service.test.ts
│   ├── app.test.ts          # HTTP-level tests via app.request(...)
│   └── main.ts              # loadConfig → createApp → mount slices → export default {port, fetch}
├── vitest.config.ts
├── tsconfig.json            # extends @obs/tsconfig/service.json (DO NOT CHANGE)
└── package.json             # deps already set (DO NOT add deps / run bun install)
```

Key idioms (all demonstrated in the embedder):

- **App factory**: `import { createApp } from "./platform/http"`. It already
  provides `GET /health`, `GET /doc`, the `onError` envelope, and the
  `defaultHook` that turns zod validation failures into a `422`
  `{ error: { code: "validation_error", message } }`.
- **Routes**: define with `createRoute({...})` using the **`@obs/contracts`**
  schemas for request body and responses, then `app.openapi(route, handler)`.
  Read the request with `c.req.valid("json")`.
- **Bun entrypoint**: `export default { port: config.port, fetch: app.fetch }`.
  `package.json` has `"start": "bun run src/main.ts"` and `"dev": "bun --watch src/main.ts"`.
- **Numeric literal gotcha**: returning a `z.literal(384)` field needs a cast,
  e.g. `dim: EMBEDDING_DIM as 384`, because object-literal numbers widen to `number`.
- **Tests run under Node via Vitest** — only use Web/Node APIs (`fetch`,
  `crypto`, `process`). No `Bun.*` APIs in code that tests import.

---

## 3. Available shared packages (already implemented — import, don't modify)

### `@obs/domain` (pure TS, no deps)

- `Tenant`, `makeTenant(s)`, `parseTenant(s)`, `InvalidTenantError`
- `PromptText`, `makePromptText(s)`, `MAX_PROMPT_CHARS`
- `TokenCount`, `makeTokenCount(n)`, `estimateTokens(text)`, `addTokens(a,b)`
- `RetrievalResult` (interface: `chunkId, docId, body, score`)
- `Completion` (interface), `FinishReason = "stop" | "length" | "error"`
- `EMBEDDING_DIM = 384`, `hashEmbedding(text): number[]`,
  `normalizeForEmbedding(text)`, `cosineSimilarity(a, b)`

### `@obs/contracts` (zod v4 schemas + inferred types)

All inter-service request/response shapes. Import the schema **and** the type:

- common: `EMBEDDING_DIM`, `ErrorResponseSchema`/`ErrorResponse`,
  `HealthResponseSchema`/`HealthResponse`, `UsageSchema`/`Usage`,
  `FinishReasonSchema`/`FinishReason`
- embedder: `EmbedRequestSchema`/`EmbedRequest` (`{ text }`),
  `EmbedResponseSchema`/`EmbedResponse` (`{ embedding: number[384], dim: 384, cached }`)
- retriever: `RetrieveRequestSchema`/`RetrieveRequest` (`{ embedding[384], topK }`),
  `RetrievedChunkSchema`/`RetrievedChunk` (`{ chunkId, docId, body, score }`),
  `RetrieveResponseSchema`/`RetrieveResponse` (`{ results: RetrievedChunk[] }`)
- model: `CompleteRequestSchema`/`CompleteRequest` (`{ prompt, context: string[], maxTokens? }`),
  `CompleteResponseSchema`/`CompleteResponse` (`{ completion, model, finishReason, usage }`)
- gateway: `ChatRequestSchema`/`ChatRequest` (`{ prompt, topK }`),
  `RetrievedRefSchema`/`RetrievedRef` (`{ chunkId, docId, score, snippet }`),
  `ChatResponseSchema`/`ChatResponse`
  (`{ completion, model, usage, retrieved: RetrievedRef[], cached }`),
  `GatewayEmbedRequestSchema`, `GatewayEmbedResponseSchema`

---

## 4. Topology — service names, ports, URLs

| Service     | Container     | Port | In-cluster URL                                       | Env var for port   |
| ----------- | ------------- | ---- | ---------------------------------------------------- | ------------------ |
| gateway     | `gateway`     | 8080 | `http://gateway:8080`                                | `GATEWAY_PORT`     |
| embedder    | `embedder`    | 8081 | `http://embedder:8081`                               | `EMBEDDER_PORT`    |
| retriever   | `retriever`   | 8082 | `http://retriever:8082`                              | `RETRIEVER_PORT`   |
| model-proxy | `model-proxy` | 8083 | `http://model-proxy:8083`                            | `MODEL_PROXY_PORT` |
| postgres    | `postgres`    | 5432 | `postgres://lab:lab@postgres:5432/observability_lab` | `DATABASE_URL`     |
| redis       | `redis`       | 6379 | `redis://redis:6379`                                 | `REDIS_URL`        |

Gateway upstream URLs (env, defaults are the in-cluster URLs above):
`EMBEDDER_URL`, `RETRIEVER_URL`, `MODEL_PROXY_URL`.

Auth (dev): `Authorization: Bearer <token>`. Dev tenant registry (hardcoded in
the gateway auth slice; the `acme` token is also surfaced via `DEV_TOKEN`):

| tenant   | token              | rate capacity | refill / sec |
| -------- | ------------------ | ------------- | ------------ |
| `acme`   | `dev-local-token`  | 1000          | 1000         |
| `bravo`  | `dev-token-bravo`  | 1000          | 1000         |
| `abuser` | `dev-token-abuser` | 20            | 10           |

(`acme`/`bravo` are generous so the load test sustains ≥100 rps; `abuser` is tiny
so the abusive scenario reliably trips 429.)

---

## 5. Shared HTTP conventions (every service)

- `GET /health` → `200 { status:"ok", service, uptimeMs }` (provided by `createApp`).
- `GET /doc` → OpenAPI 3.0 JSON (provided by `createApp`).
- Validation failure → `422 { error:{ code:"validation_error", message } }`.
- Any `AppError` → its status + `{ error:{ code, message, requestId? } }`.
- Unhandled error → `500 { error:{ code:"internal_error", message } }`.

---

## 6. Per-service specifications

### 6.1 `apps/model-proxy` — the mock LLM (the keystone)

- Endpoint: `POST /v1/complete` (body `CompleteRequest`, response `CompleteResponse`).
- **Deterministic completion**: derive text from a hash of `prompt` (+ `context`).
  When `context` is non-empty, the completion text **must quote/reference the first
  context item** (e.g. start with `Based on: "<first 80 chars of context[0]>" …`)
  so the gateway can prove a retrieved chunk was used. `model` = `"mock-llm-v1"`.
  `usage` via `estimateTokens` on prompt(+context) and on the completion.
  `finishReason` = `"stop"` (or `"length"` if truncated to `maxTokens`).
- **Rich fault model** (all knobs from env, defaults in parens), drawn per request:
  - `FAULT_P_500` (0.01) → respond `500 { error:{ code:"model_error" } }`.
  - `FAULT_P_429` (0.03) → respond `429 { error:{ code:"model_overloaded" } }`.
  - `FAULT_P_STALL` (0.01) + `STALL_MS` (30000) → `await sleep(STALL_MS)` then succeed.
  - Latency: base `LATENCY_BASE_MS` (40) + a **gamma-distributed** delay with
    `LATENCY_GAMMA_SHAPE` (2.0) and `LATENCY_GAMMA_SCALE_MS` (60), capped at
    `LATENCY_MAX_MS` (4000). Implement a gamma sampler (Marsaglia–Tsang).
  - **Error clustering ("bad minute")**: keep module-level state. With small
    probability per request enter a _degraded_ window lasting `BAD_MINUTE_MS`
    (60000) during which `FAULT_P_500`/`FAULT_P_429` are multiplied by
    `BAD_MINUTE_MULTIPLIER` (8); then recover. Controlled by `FAULT_P_BAD_MINUTE` (0.002).
  - A global on/off: `FAULTS_ENABLED` (true). When false, never inject faults
    (used by deterministic unit tests).
- Slices: `complete/` (handler + deterministic generator + fault model). Put the
  fault model in `complete/faults.ts` and make it unit-testable with an injected
  RNG and `FAULTS_ENABLED=false` for the deterministic path.
- Tests: deterministic completion is stable for a fixed prompt; completion
  references context; with faults disabled never errors; gamma sampler returns
  positive finite numbers.

### 6.2 `apps/embedder` — DONE (reference). Do not modify.

### 6.3 `apps/retriever` — pgvector top-k + the seed script

- Endpoint: `POST /v1/retrieve` (body `RetrieveRequest`, response `RetrieveResponse`).
- Slices: `query/` (handler + DB query), `rank/` (maps DB rows → `RetrievedChunk`,
  sorts by score desc, clamps to topK).
- DB: `src/db/client.ts` (postgres.js + `drizzle(client, { schema })`),
  `src/db/schema.ts`:
  ```ts
  import { pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
  export const chunks = pgTable("chunks", {
    id: text("id").primaryKey(),
    docId: text("doc_id").notNull(),
    body: text("body").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```
- Query (cosine similarity = `1 - cosineDistance`):
  ```ts
  import { cosineDistance, desc, sql } from "drizzle-orm";
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;
  const rows = await db
    .select({ chunkId: chunks.id, docId: chunks.docId, body: chunks.body, score: similarity })
    .from(chunks)
    .orderBy(desc(similarity))
    .limit(topK);
  ```
- **Seed script** `src/seed/seed.ts` (run via `bun run seed`):
  1. Download `SEED_CORPUS_URL` (default a pinned Project Gutenberg plain-text
     book, e.g. `https://www.gutenberg.org/cache/epub/1342/pg1342.txt`). If
     `SEED_CORPUS_SHA256` is set, verify it. On any failure, log a warning and
     fall back to a deterministic generated corpus.
  2. Strip Gutenberg header/footer, split into ~`SEED_CHUNK_COUNT` (1000) chunks
     of a few sentences each. `docId` = book id; `id` = `${docId}-${index}`.
  3. For each chunk: `embedding = hashEmbedding(body)` (from `@obs/domain`).
  4. Insert with `onConflictDoNothing()` (idempotent). Batch inserts (~200/batch).
  5. After load: `CREATE INDEX IF NOT EXISTS chunks_embedding_ivfflat ON chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);` then `ANALYZE chunks;`
  6. Log how many chunks now exist.
  - Env: `DATABASE_URL`, `SEED_CORPUS_URL`, `SEED_CORPUS_SHA256?`, `SEED_CHUNK_COUNT`.
- Tests: rank logic (sort desc, clamp topK); chunking produces N non-empty chunks
  and stable ids. **Do not require a live DB in unit tests** — test pure functions.

### 6.4 `apps/gateway` — auth, rate-limit, inference orchestration, usage-metering

Slices (each its own folder with `slice.ts`):

- `auth/`: bearer-token middleware → resolves `Tenant` from the registry (§4) or
  `401 { error:{ code:"unauthorized" } }`. Store tenant on the Hono context.
- `rate-limit/`: Redis **token bucket** per tenant, key `rl:<tenant>`. Use an
  atomic Lua script (capacity + refill from the tenant registry). Provide an
  in-memory limiter adapter for tests. Exceed → `429 { error:{ code:"rate_limited" } }`.
- `inference/`: orchestrates the RAG flow. Ports `EmbedderClient`,
  `RetrieverClient`, `ModelClient` (adapters in `adapters/*-http.ts` parse
  responses with the contracts schemas). Flow:
  1. embed prompt via embedder → `embedding`, `cached`
  2. retrieve via retriever (`embedding`, `topK`) → chunks
  3. complete via model-proxy (`prompt`, `context = chunk bodies`) → completion
  4. write usage (usage-metering)
  5. respond `ChatResponse` with `retrieved` = chunks mapped to `RetrievedRef`
     (`snippet` = first 160 chars of body), `cached` = embedder's `cached` flag.
  - Endpoints: `POST /v1/chat` (`ChatRequest`→`ChatResponse`); `POST /v1/embed`
    (passthrough to embedder, `GatewayEmbedRequest`→`GatewayEmbedResponse`).
  - Upstream calls share an HTTP client with `UPSTREAM_TIMEOUT_MS` (8000) via
    `AbortSignal.timeout`. Mapping: upstream timeout → `504 { code:"upstream_timeout" }`;
    model-proxy `429` → propagate `429 { code:"model_overloaded" }`; any other
    upstream non-2xx or network error → `502 { code:"upstream_error" }`.
- `usage-metering/`: Drizzle table `usage_events`:
  ```ts
  import { pgTable, text, integer, timestamp, bigint } from "drizzle-orm/pg-core";
  export const usageEvents = pgTable("usage_events", {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    tenant: text("tenant").notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```
  Insert one row per successful chat (omit `id`/`createdAt`). Failure to write
  usage must **not** fail the request (log + continue).
- Tests (required): (a) **inference orchestration** with fake clients returns the
  expected `ChatResponse` and passes retrieved chunk bodies as model context;
  (b) **rate-limit** returns 429 after the bucket is exhausted (in-memory adapter).

### 6.5 `apps/load-generator` — weighted traffic + chaos

- Bun script (`src/main.ts`, run via `bun run start`). Env: `GATEWAY_URL`
  (`http://localhost:8080`), `TARGET_QPS` (120), `DURATION_SECONDS` (300),
  `REQUEST_TIMEOUT_MS` (15000), `CONCURRENCY` (64).
- Weighted scenarios: `happy` (valid prompt, tenant acme), `repeat` (small fixed
  set of prompts → cache-friendly, tenant bravo), `long` (very long prompt),
  `abusive` (tenant abuser, bursts → 429), `broken` (malformed JSON / missing
  prompt → 422). Reasonable default weights (e.g. 55/20/10/10/5).
- Drive QPS with a scheduler + bounded concurrency. Each request uses
  `AbortSignal.timeout(REQUEST_TIMEOUT_MS)`.
- **Summary at exit** (printed as a table + JSON): total requests, achieved QPS,
  and counts bucketed as `ok` (2xx), `rateLimited` (429), `clientError`
  (other 4xx), `serverError` (5xx except 504), `timeout` (504 **or** client
  abort/network), plus latency p50/p95/p99. Exit code 0.
- Tests: the bucketing function maps status/exception → the right bucket.

### 6.6 `infra` + `scripts` — compose, Postgres, Dockerfile, smoke

- **`infra/Dockerfile`** (single shared image for all TS services):
  ```dockerfile
  FROM oven/bun:1.3.8
  WORKDIR /app
  COPY package.json bun.lock turbo.json tsconfig.json ./
  COPY packages ./packages
  COPY apps ./apps
  RUN bun install --frozen-lockfile
  EXPOSE 8080
  CMD ["bun", "run", "start"]
  ```
- **`infra/postgres/init/01-init.sql`** (extension + tables only; **no** ivfflat
  index here — the seed builds it post-load):
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, body TEXT NOT NULL,
    embedding vector(384) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS usage_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant TEXT NOT NULL, prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL, model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS usage_events_tenant_idx ON usage_events (tenant, created_at);
  ```
- **`infra/compose.yml`** — extend the existing file (keep the `app`/`obs`
  networks). Add `postgres` (image `pgvector/pgvector:pg16`, init volume,
  `pg_isready` healthcheck), `redis` (`redis:7-alpine`, `redis-cli ping`
  healthcheck), the four TS services (shared build via a YAML anchor; per-service
  `working_dir: /app/apps/<svc>`, `command: ["bun","run","start"]`, env, and a
  `bun -e "fetch('http://localhost:<port>/health')..."` healthcheck), a one-shot
  `seed` service (`working_dir: /app/apps/retriever`, `command: ["bun","run","seed"]`,
  `depends_on: postgres healthy`, `restart: "no"`), and `load-generator` behind a
  `load` profile. `depends_on` with `condition: service_healthy`: retriever→postgres;
  embedder/gateway→redis; gateway→embedder,retriever,model-proxy (healthy).
  All on the `app` network.
- **`scripts/smoke.sh`**: `docker compose -f infra/compose.yml up -d --build`;
  wait for gateway health; run `docker compose run --rm seed` (idempotent);
  `curl -fsS -X POST localhost:8080/v1/chat -H "authorization: Bearer dev-local-token"
-H "content-type: application/json" -d '{"prompt":"hello"}'` and assert it
  returns a completion with a non-empty `retrieved` array. Print PASS/FAIL.
- Update **`scripts/dev-up.sh`** if needed so the subject system comes up.
- Per-service `.env.example` files: each agent maintains its own service's.

---

## 7. Hard rules for implementation agents

- Work **only** inside `W:/personal-code/observability-tools/.worktree/phase-1`.
- **Do not** run `bun install`, `bun add`, or modify any `package.json`
  `dependencies`/`devDependencies`, `bun.lock`, or any root config file. All deps
  are already installed. (You may add `scripts` entries to your own service's
  `package.json` if needed.)
- **Do not** modify another service's directory, `packages/domain`,
  `packages/contracts`, or `apps/embedder`.
- Import shared types/values from `@obs/domain` and `@obs/contracts` — never
  redefine them.
- Use extensionless relative imports (`./foo`), `import type` for type-only
  imports (verbatimModuleSyntax is on), and respect `noUncheckedIndexedAccess`
  (guard array/`Map` access).
- Before returning, your code **must pass**: `bunx tsc --noEmit -p apps/<svc>/tsconfig.json`,
  `bunx vitest run` (in your service dir), and `bunx oxlint apps/<svc>`.
