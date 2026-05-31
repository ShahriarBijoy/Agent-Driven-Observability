# AI Observability Lab

A free, local, Docker-Compose learning lab where a small AI inference gateway becomes the subject of full-spectrum observability. The gateway handles LLM requests and emits logs, metrics, distributed traces, data-lineage events, and data-quality signals. Claude agents then read that telemetry — via Grafana dashboards, Jaeger traces, Marquez lineage graphs, and a custom MCP tool — to diagnose problems, explain anomalies, and trigger remediations automatically.

## Status

Phase 1 (Subject system) complete — a working AI inference gateway with a real RAG pipeline (no observability yet; that is Phase 2). The gateway orchestrates embedder → retriever (pgvector top-k over a ~1,000-chunk seeded corpus) → model-proxy (a deterministic mock LLM with a rich fault model), behind bearer-token auth, per-tenant Redis token-bucket rate limiting, and Postgres usage-metering. A load-generator drives weighted, chaotic traffic. See `docs/adr/002-subject-system.md` for the design and `docs/PLAN.html` for the full phased roadmap.

## Stack

- **Bun workspaces + Turborepo** — fast installs, incremental task execution across all packages
- **TypeScript (strict)** — shared `@obs/tsconfig` presets for libraries and services
- **Oxlint + Oxfmt** — fast Rust-based linting and formatting
- **Vitest** — unit and integration tests across the monorepo via workspace config
- **Docker Compose** — local infrastructure (Postgres/pgvector, Redis, Grafana, Jaeger, Prometheus, Marquez)
- **Python (uv)** — `agent-service` (Claude-powered diagnostics) and `dq-runner` (data-quality checks)

## Layout

```
apps/
  gateway/          # Bun HTTP server — AI inference gateway (OTEL instrumented)
  web/              # Next.js dashboard
  agent-service/    # Python — Claude agent reads telemetry, triggers actions
  dq-runner/        # Python — Great Expectations / custom data-quality checks
packages/
  contracts/        # Shared TypeScript types and Zod schemas
  domain/           # Domain logic (pure, no I/O)
  otel-helpers/     # OTEL SDK wrappers
  tsconfig/         # Shared tsconfig presets (base / library / service)
infra/
  compose.yml                  # Core services (Postgres, Redis)
  compose.observability.yml    # Grafana, Prometheus, Jaeger, Loki, OTEL Collector
  compose.lineage.yml          # Marquez (OpenLineage)
slo/                # SLO / alert definitions (YAML)
runbooks/           # Markdown runbooks for each alert
docs/               # PLAN.html (source of truth for all phases)
scripts/            # Dev-helper shell scripts
```

## Quickstart

```bash
# 1. Install all workspace dependencies
bun install

# 2. Bring up local infrastructure
docker compose \
  -f infra/compose.yml \
  -f infra/compose.observability.yml \
  -f infra/compose.lineage.yml \
  up -d

# 3. Copy environment template and fill in any secrets
cp .env.example .env

# 4. Daily development commands
bun run dev          # start all services in watch mode via Turborepo
bun run lint         # oxlint across the monorepo
bun run typecheck    # tsc --noEmit across all packages
bun run test         # vitest run across all packages
bun run format       # oxfmt --write .
```

### Run the subject system (Phase 1)

```bash
# Build + start postgres, redis, and the four TS services; seed the corpus.
docker compose -f infra/compose.yml up -d --build

# One-command smoke test: waits for health, seeds, and asserts /v1/chat
# returns a completion that used a retrieved chunk.
bash scripts/smoke.sh

# Ask the gateway a question (RAG over the seeded corpus):
curl -s -X POST localhost:8080/v1/chat \
  -H "authorization: Bearer dev-local-token" \
  -H "content-type: application/json" \
  -d '{"prompt":"what is pride and prejudice about","topK":3}'

# Drive synthetic traffic + chaos (opt-in `load` profile, or run on the host):
GATEWAY_URL=http://localhost:8080 TARGET_QPS=120 DURATION_SECONDS=300 \
  bun --cwd apps/load-generator run start
```

Dev tenants (bearer tokens): `dev-local-token` (acme), `dev-token-bravo` (bravo),
`dev-token-abuser` (abuser — tiny quota, trips 429s).

### Service addresses (after `docker compose up`)

| Service       | Address               | Credentials   |
| ------------- | --------------------- | ------------- |
| Web dashboard | http://localhost:3003 |               |
| Grafana       | http://localhost:3001 | admin / admin |
| Marquez UI    | http://localhost:3002 |               |
| Gateway API   | http://localhost:8080 |               |
| Agent service | http://localhost:8090 |               |

## The plan

The full phased implementation plan — Phase 0 through Phase 6 — lives in `docs/PLAN.html` and is the authoritative source of truth. Each phase is implemented independently, building on the scaffold created in Phase 0.
