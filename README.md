# AI Observability Lab

A free, local, Docker-Compose learning lab where a small AI inference gateway becomes the subject of full-spectrum observability. The gateway serves a real RAG pipeline (embedder → pgvector retriever → mock LLM) and emits logs, metrics, distributed traces, data-lineage events, and data-quality signals. Claude agents then read that telemetry — Grafana dashboards, Tempo traces, Marquez lineage, Postgres — to diagnose problems, write postmortems, and trigger remediations behind approval gates.

## What's inside

- **Subject system** — Bun services (gateway, embedder, retriever, model-proxy) with bearer-token auth, per-tenant rate limiting, usage metering, and a load generator with a chaos fault model
- **Application observability** — manual OpenTelemetry → Grafana Alloy → Loki / Tempo / Mimir, with provisioned RED + RAG dashboards, exemplars, service map, and tail-based sampling
- **Data observability** — every request is an OpenLineage run in Marquez; a Python dq-runner checks freshness / volume / drift / schema / cache every 30s
- **Control plane** — a TanStack Start web app (`:3003`): golden signals, embedded Grafana/Marquez, incident inbox, runbooks, and a streaming agent chat with live tool calls and artifacts
- **Claude agents** — a host-side FastAPI service (`:8090`, Claude Agent SDK) with five agents: RCA assistant, incident reporter, dashboard generator, runbook executor (per-step approvals), and auto-fixer (PR behind an approval gate). Every run is itself a Tempo trace.
- **Chaos & SLOs** — a clock-driven chaos scheduler, SLO specs compiled to Mimir recording rules, multi-window burn-rate alerts, browser RUM, opt-in eBPF profiling, and a one-command incident demo

## Prerequisites

- **Docker Desktop** (the lab is ~15 containers)
- **Bun** ≥ 1.1 (workspaces + Turborepo)
- **uv** (Python; for the agent-service)
- **Claude Code** logged in on this machine — the agent-service authenticates the Claude Agent SDK against your local session; no API key needed

## Quickstart

```bash
bun install          # one-time: install workspace dependencies
cp .env.example .env # one-time: local defaults work out of the box
```

The lab is driven by the **`obs` CLI** (`scripts/obs.ps1`, PowerShell). To call it as `obs` from anywhere, add a function to your PowerShell `$PROFILE`:

```powershell
function obs { & '<path-to-repo>\scripts\obs.ps1' @args }
```

Then bring up everything at once:

```powershell
obs all              # containers + agent-service + web + load traffic (own windows)
```

…or piece by piece:

```powershell
obs up               # 1. the 15 containers (subject + observability + lineage)
obs agents           # 2. agent-service :8090  (own terminal, Ctrl-C to stop)
obs web              # 3. web control plane :3003  (own terminal, Ctrl-C to stop)
obs load 120 300     # 4. synthetic traffic so dashboards populate
```

The full lab is those three pieces: **containers + `obs agents` + `obs web`**. The two host processes run outside compose so the Agent SDK can use your Claude Code login and the web app can hot-reload.

### `obs` command reference

| Command                  | What it does                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `obs all [qps] [secs]`   | Everything: containers, agent-service, web, and load, in their own windows |
| `obs up [--build]`       | Bring up the full lab (handles the compose network-ordering gotcha)        |
| `obs down [-v]`          | Tear it down (`-v` also wipes volumes: seeded data + Grafana state)        |
| `obs load [qps] [secs]`  | Drive synthetic traffic (defaults 120 qps / 300s)                          |
| `obs demo [qps] [secs]`  | Full cycle: up --build → wait healthy → load → down                        |
| `obs web` / `obs agents` | Run a host process in the current terminal                                 |
| `obs smoke`              | Phase-1 end-to-end smoke test                                              |
| `obs ps` / `obs logs`    | Container status / follow logs                                             |
| `obs urls` / `obs hosts` | Print the address table / host-process commands                            |

### Without the wrapper (macOS / Linux)

```bash
bash scripts/dev-up.sh --build                                  # containers (all three planes)
(cd apps/agent-service && uv sync && uv run python -m agent_service)  # :8090
bun --cwd apps/web run dev                                      # :3003
GATEWAY_URL=http://localhost:8080 TARGET_QPS=120 DURATION_SECONDS=300 \
  bun --cwd apps/load-generator run start                       # traffic
```

## Service addresses

| Service       | Address               | Notes                      |
| ------------- | --------------------- | -------------------------- |
| Control plane | http://localhost:3003 | dev mode, no auth          |
| Grafana       | http://localhost:3001 | anonymous (Admin)          |
| Marquez UI    | http://localhost:3002 | lineage graph              |
| Gateway API   | http://localhost:8080 | bearer tokens below        |
| Agent service | http://localhost:8090 | host process               |
| dq-runner     | http://localhost:8091 | `/violations`, `POST /run` |
| Pyroscope     | http://localhost:4040 | profiles (opt-in profiler) |

Dev tenants (gateway bearer tokens): `dev-local-token` (acme), `dev-token-bravo` (bravo), `dev-token-abuser` (abuser — tiny quota, trips 429s).

## Things to try

- **Ask the gateway a question** (RAG over the seeded corpus):
  ```bash
  curl -s -X POST localhost:8080/v1/chat \
    -H "authorization: Bearer dev-local-token" \
    -H "content-type: application/json" \
    -d '{"prompt":"what is pride and prejudice about","topK":3}'
  ```
- **Chat with the RCA assistant** at http://localhost:3003/agents — it runs real Loki/Tempo/Mimir/Postgres queries (shown live as collapsed tool-call rows) and saves Markdown/HTML artifacts that open in a split-pane viewer.
- **Trigger an incident postmortem** (Grafana also posts here automatically when an alert fires):
  ```bash
  curl -X POST localhost:8090/webhook/grafana-alert -H 'content-type: application/json' \
    -d '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"Gateway 5xx rate > 2%","severity":"page"},"annotations":{"summary":"gateway 5xx above 2%"}}]}'
  ```
- **Generate a Grafana dashboard** from a natural-language brief:
  ```bash
  curl -X POST localhost:8090/generate-dashboard -H 'content-type: application/json' \
    -d '{"brief":"gateway health: request rate, p95 latency, and 5xx share over time"}'
  ```
- **Run a runbook with approvals**: http://localhost:3003/runbooks → "run with executor", then approve/deny each step on the run page.
- **The keystone demo** — one on-purpose incident end to end (~6–8 min): injects a chaos error burst, waits for the reporter's postmortem in the incident inbox, then runs an RCA follow-up (needs the agent-service up):
  ```bash
  bun run demo:incident
  ```
- **Scheduled chaos** (full 26-min timeline that drives the SLO burn-rate alerts): `bun run chaos:run`
- **Follow the telemetry**: in Grafana, click a latency exemplar on the RED dashboard to jump to its Tempo trace, then "Logs for this span" to land on the matching `trace_id` in Loki. Every agent run is also a trace (`service.name=agent-service`).

> **Windows note:** the agent-service binds IPv4; the web app defaults to `http://127.0.0.1:8090` because `localhost` may resolve to IPv6 first and refuse the connection.

## Development

```bash
bun run dev          # all TS services in watch mode (stop the compose app services first — same ports)
bun run test         # vitest across the monorepo
bun run typecheck    # tsc --noEmit everywhere
bun run lint         # oxlint
bun run format       # oxfmt --write .
```

## Layout

```
apps/
  gateway/          # Bun HTTP server — AI inference gateway (OTel instrumented)
  embedder/         # deterministic embedding service
  retriever/        # pgvector top-k retrieval over a seeded corpus
  model-proxy/      # mock LLM with a fault model + /admin/chaos control plane
  load-generator/   # weighted chaotic traffic + the chaos scheduler
  web/              # TanStack Start control plane (:3003)
  agent-service/    # Python + Claude Agent SDK — the five agents (:8090)
  dq-runner/        # Python — scheduled data-quality checks (:8091)
packages/
  contracts/        # shared types + Zod schemas (incl. the agent wire contract)
  domain/           # pure domain logic
  telemetry/        # @obs/telemetry — OTel init + manual instrumentation helpers
  lineage/          # @obs/lineage — OpenLineage builders + Marquez emitter
  ui/ tsconfig/     # design tokens, shared tsconfig presets
infra/
  compose.yml                  # subject system (Postgres, Redis, TS services, seed, load)
  compose.observability.yml    # Alloy + Loki/Tempo/Mimir + Grafana + Pyroscope
  compose.lineage.yml          # Marquez + dq-runner
slo/                # SLO specs (source of truth for recording rules + alerts)
runbooks/           # Markdown runbooks the executor agent walks with approvals
scripts/            # obs.ps1 (the CLI), dev-up.sh, smoke.sh, demo-incident.sh
docs/               # PLAN.html (the full phased plan), ADRs, plain-language explainers
```

## Docs

The full phased plan (0–6) lives in `docs/PLAN.html`; design decisions are in `docs/adr/`; plain-language walkthroughs of each plane are in `docs/phase-*-explained.html`.
