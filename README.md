# AI Observability Lab

A free, local, Docker-Compose learning lab where a small AI inference gateway becomes the subject of full-spectrum observability. The gateway handles LLM requests and emits logs, metrics, distributed traces, data-lineage events, and data-quality signals. Claude agents then read that telemetry — via Grafana dashboards, Jaeger traces, Marquez lineage graphs, and a custom MCP tool — to diagnose problems, explain anomalies, and trigger remediations automatically.

## Status

Phase 0 (Foundation) complete — monorepo scaffold only, no feature code yet. All application packages contain placeholder source files. See `docs/PLAN.html` for the full phased roadmap.

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

### Service addresses (after `docker compose up`)

| Service       | Address               | Credentials   |
| ------------- | --------------------- | ------------- |
| Web dashboard | http://localhost:3000 |               |
| Grafana       | http://localhost:3001 | admin / admin |
| Marquez UI    | http://localhost:3002 |               |
| Gateway API   | http://localhost:8080 |               |
| Agent service | http://localhost:8090 |               |

## The plan

The full phased implementation plan — Phase 0 through Phase 6 — lives in `docs/PLAN.html` and is the authoritative source of truth. Each phase is implemented independently, building on the scaffold created in Phase 0.
