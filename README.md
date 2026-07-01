# AI Observability Lab

A free, local, Docker-Compose learning lab where a small AI inference gateway becomes the subject of full-spectrum observability. The gateway handles LLM requests and emits logs, metrics, distributed traces, data-lineage events, and data-quality signals. Claude agents then read that telemetry — via Grafana dashboards, Tempo traces, Marquez lineage graphs, and a custom MCP tool — to diagnose problems, explain anomalies, and trigger remediations automatically.

## Status

Phase 6 (Chaos, SLOs & production polish) complete — the lab can now produce an incident on purpose and narrate it end to end. A clock-driven **chaos scheduler** (`bun run chaos:run`) reads a YAML timeline (happy → latency spike → error burst → retriever outage → baseline) and drives dev-only `/admin/chaos` control planes on the model-proxy and retriever, so failures are repeatable and genuinely move the SLIs. Three **SLOs** live as source-of-truth specs in `slo/*.yaml` (availability 99.5%, latency 95% < 1.5s, RAG quality 90% top-1 ≥ 0.6), compiled into **Mimir recording rules** and **multi-window multi-burn-rate** Grafana alerts (fast-burn pages, slow-burn tickets) that route to the incident reporter. Alloy gains **cardinality control** (drops unbounded metric labels; a Mimir series cap + self-scrape + alert) and **tail-based sampling** (keep every error/slow trace + 10% of the rest). **Pyroscope** profiles the Bun services via an opt-in **eBPF** profiler (Bun uses JavaScriptCore, so V8-based Node profilers can't; trace→profile correlation + a Profiles dashboard). Browser **RUM** now emits real metrics (request rate, error rate, LCP) behind a "Frontend" dashboard row. The keystone is `bun run demo:incident` — one script that injects chaos, waits for the postmortem in the incident inbox, and runs an RCA follow-up. See `docs/adr/005-chaos-slos-and-production-polish.md`, `docs/learning-notes.md`, and `docs/PLAN.html` section #p6.

Phase 5 (Claude agents) complete — the control plane is now backed by a real agent-service. **`apps/agent-service`** (FastAPI + the **Claude Agent SDK**, managed with `uv`) hosts five agents that read the telemetry plane and act on it: an **RCA assistant** (interactive chat), an **incident reporter** (triggered by a Grafana alert → Markdown postmortem + an `incidents` row), a **dashboard generator** (natural-language brief → a real Grafana dashboard), a **runbook executor** (walks `runbooks/*.md` with **blocking per-step approvals**), and an **auto-fixer** (fixes a bug in a **contained clone** and opens a PR behind an approval gate). All five share one toolkit — `loki_query` / `tempo_query` / `mimir_query` / `marquez_lineage` / `pg_select` / `grafana_create_dashboard` / `gh_open_pr` / `runbook_read` / `request_approval` / `save_artifact`, registered as Claude Agent SDK tools — so only the system prompt and allow-list differ per agent. Every run streams over **SSE** in the `@obs/contracts` wire format (the Phase-4 web UI is unchanged), persists to a five-table audit schema in Postgres, and appears in **Tempo** as one `agent.<kind>` trace with a `tool.<name>` child span per tool call. The web BFF's echo agent is gone: `agent-client.ts` and `/api/agents/chat` now proxy the real service. The SDK authenticates against your local Claude Code session — no API key. See `docs/PLAN.html` section #p5.

Phase 4 (Frontend) complete — the lab has a real control plane. **`apps/web`** is a TanStack Start app (React 19, Tailwind v4) on **http://localhost:3003**, themed entirely from **`@obs/ui`** design tokens (warm off-black, sodium amber, Fraunces/IBM Plex Sans/JetBrains Mono). The home page reads golden signals from Mimir and recent incidents/agent-runs from Postgres; `/telemetry` and `/lineage` embed Grafana (kiosk, anonymous) and Marquez in iframes driven by a top-bar time-range control; `/agents` streams a chat over **SSE** against a placeholder **echo agent** in the BFF — including live tool-call events and a working **approval gate** on the run-detail page; `/incidents` renders Markdown postmortems; `/runbooks` lists `runbooks/*.md` with a "run with executor" launcher; `/settings` shows the dev token, tenant registry, and the agent permission matrix. The browser itself is instrumented (OTel web SDK → Alloy), so frontend fetch spans join the gateway's trace tree. The agent wire contract (runs, stream events, approvals) lives in `@obs/contracts`; Phase 5's agent-service replaces the echo agent behind the same seam (`apps/web/src/server/agent-client.ts`).

Phase 3 (Data observability) complete — the RAG pipeline is now modelled as a data pipeline. Every `/v1/chat` is an **OpenLineage** run of the job `rag.inference`, with `rag.embed` / `rag.retrieve` sub-runs linked via the parent-run facet, emitted to **Marquez**; the gateway also records each successful inference to an `inferences` table (the materialisation of the `prompts.recent` / `completions.recent` datasets). A Python **dq-runner** (FastAPI + APScheduler) runs five data-quality checks every 30s — freshness, volume, distribution drift (Kolmogorov–Smirnov), schema, and cache health — pushing `dq_*` metrics over OTLP to Mimir and persisting violations to `dq_violations`. Grafana ships a **Data Quality** dashboard (with a link-out to the Marquez graph) and two DQ alerts. See `docs/adr/004-data-observability.md` for the lineage taxonomy and threshold rationale.

Phase 2 (Application observability) complete — the subject system is now fully instrumented with OpenTelemetry and observed through the Grafana LGTM stack. Every service emits traces, metrics, and structured logs over OTLP to **Grafana Alloy**, which fans out to **Loki** (logs), **Tempo** (traces), and **Mimir** (metrics). Grafana ships provisioned datasources, a **Gateway RED** dashboard, a **RAG Pipeline** dashboard, and two alert rules. Distributed traces propagate across the gateway → embedder/retriever/model-proxy call graph (service map), and exemplars link the latency histograms to the exact traces that produced them. See `docs/adr/003-application-observability.md` for the design and the Bun-specific deviations (manual instrumentation; exemplars sourced from Tempo's metrics-generator).

The underlying subject system (Phase 1) is a working AI inference gateway with a real RAG pipeline: embedder → retriever (pgvector top-k over a ~1,000-chunk seeded corpus) → model-proxy (a deterministic mock LLM with a rich fault model), behind bearer-token auth, per-tenant Redis token-bucket rate limiting, and Postgres usage-metering. A load-generator drives weighted, chaotic traffic. See `docs/adr/002-subject-system.md` and `docs/PLAN.html` for the full phased roadmap.

## Stack

- **Bun workspaces + Turborepo** — fast installs, incremental task execution across all packages
- **TypeScript (strict)** — shared `@obs/tsconfig` presets for libraries and services
- **Oxlint + Oxfmt** — fast Rust-based linting and formatting
- **Vitest** — unit and integration tests across the monorepo via workspace config
- **OpenTelemetry + Grafana LGTM** — shared `@obs/telemetry` (manual instrumentation, Bun-compatible) exports OTLP to Grafana Alloy → Loki (logs) / Tempo (traces) / Mimir (metrics), viewed in Grafana
- **Docker Compose** — local infrastructure (Postgres/pgvector, Redis, the LGTM observability stack, and Marquez lineage)
- **Python (uv)** — `agent-service` (Claude-powered diagnostics) and `dq-runner` (data-quality checks)

## Layout

```
apps/
  gateway/          # Bun HTTP server — AI inference gateway (OTEL instrumented)
  web/              # TanStack Start control plane (:3003) — dashboards, agents, incidents, runbooks
  agent-service/    # Python — Claude agent reads telemetry, triggers actions
  dq-runner/        # Python — scheduled data-quality checks (freshness/volume/drift/schema/cache)
packages/
  contracts/        # Shared TypeScript types and Zod schemas (incl. the agent wire contract)
  ui/               # @obs/ui — design tokens (tokens.css) + themed React primitives
  domain/           # Domain logic (pure, no I/O)
  telemetry/        # @obs/telemetry — OTel SDK init + manual instrumentation helpers
  lineage/          # @obs/lineage — OpenLineage event builders + Marquez emitter
  tsconfig/         # Shared tsconfig presets (base / library / service)
infra/
  compose.yml                  # Subject system (Postgres, Redis, the four TS services, seed, load-gen)
  compose.observability.yml    # Grafana Alloy + Loki/Tempo/Mimir + Grafana
  compose.lineage.yml          # Marquez (OpenLineage) + dq-runner (data-quality)
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

### Run the observability stack (Phase 2)

```bash
# Build + start the subject system AND the observability plane (Alloy + LGTM + Grafana).
docker compose -f infra/compose.yml -f infra/compose.observability.yml up -d --build

# Drive traffic so the dashboards populate.
docker compose -f infra/compose.yml -f infra/compose.observability.yml \
  --profile load up -d load-generator
```

Open **Grafana → http://localhost:3001** (anonymous admin): the **Gateway · RED** and
**RAG Pipeline** dashboards populate within seconds. On the RED duration panel, click a
latency **exemplar** to jump to its Tempo trace, then "Logs for this span" to land on the
matching `trace_id` in Loki. The **Service Map** (Explore → Tempo) shows the
gateway → {embedder, retriever, model-proxy} edges.

Tear it all down (add `-v` to also wipe seeded data + Grafana state):

```bash
docker compose -f infra/compose.yml -f infra/compose.observability.yml --profile load down
```

### Run data observability (Phase 3)

```bash
# Bring up the full lab: subject + observability + lineage/data-quality planes.
bash scripts/dev-up.sh --build
# (equivalently: docker compose -f infra/compose.yml \
#   -f infra/compose.observability.yml -f infra/compose.lineage.yml up -d --build)

# Drive traffic so lineage + DQ populate (the `broken`/`long` scenarios trip violations).
GATEWAY_URL=http://localhost:8080 TARGET_QPS=120 DURATION_SECONDS=600 \
  bun --cwd apps/load-generator run start
```

Then:

- **Marquez → http://localhost:3002** shows the `rag.inference` job with input/output
  dataset edges and the `rag.embed` / `rag.retrieve` sub-runs, populating live.
- **Grafana → http://localhost:3001 → Data Quality** shows freshness, volume ratio,
  drift (KS), cache hit ratio, and the violation rate, with a link-out to Marquez.
- `curl localhost:8091/violations` lists recent rows from `dq_violations`; a synthetic
  anomaly creates one within ~30s. `curl -X POST localhost:8091/run` triggers a pass now.

### Run the control plane (Phase 4)

```bash
# With the stack from Phase 2/3 up (Grafana needs the embedding flag from
# this phase's compose change — recreate grafana/alloy if they predate it):
bun --cwd apps/web run dev
```

Open **http://localhost:3003**:

- **/** — golden signals (live from Mimir) + recent incidents and agent runs.
- **/telemetry, /lineage** — Grafana dashboards (kiosk) and Marquez, embedded; the
  top-bar **window** control drives the Grafana time range.
- **/agents** — chat with the agent (the **RCA assistant** once the Phase-5 service is up;
  see below). SSE streaming with a live tool-call panel; approval gates pause the run and
  are approved/denied on the run-detail page.
- **/runbooks** — preview a runbook and "run with executor" (starts a gated run).

All values have working local defaults; see `apps/web/.env.example` to override.

### Run the Claude agents (Phase 5)

The agent-service runs on the **host** (not in compose) so the Claude Agent SDK can
authenticate against your local Claude Code session.

```bash
# 1. Full lab up (subject + observability + lineage) with traffic, per Phase 3.
bash scripts/dev-up.sh --build

# 2. Start the agent-service on the host (needs Postgres + the telemetry backends).
cd apps/agent-service && uv sync && uv run python -m agent_service   # :8090

# 3. Start the control plane on the host, pointed at the agent-service.
bun --cwd apps/web run dev   # :3003
```

Then, in the UI (or via the API directly):

- **/agents** — chat with the **RCA assistant**; it runs real Loki/Tempo/Mimir/Postgres
  queries (shown live in the tool timeline) to answer "why is X happening".
- **/incidents** — postmortems the **incident reporter** wrote. Trigger one with a synthetic
  Grafana alert (Grafana also posts here automatically via the `agent-webhook` contact point):
  ```bash
  curl -X POST localhost:8090/webhook/grafana-alert -H 'content-type: application/json' \
    -d '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"Gateway 5xx rate > 2%","severity":"page"},"annotations":{"summary":"gateway 5xx above 2%"}}]}'
  ```
- **Generate a Grafana dashboard** from a brief:
  ```bash
  curl -X POST localhost:8090/generate-dashboard -H 'content-type: application/json' \
    -d '{"brief":"gateway health: request rate, p95 latency, and 5xx share over time"}'
  ```
- **Run a runbook** with per-step approvals (approve/deny on the run page):
  ```bash
  curl -X POST localhost:8090/runbooks/snapshot-agent-audit.md/execute
  ```
- **Auto-fix a bug** behind an approval gate (opens a PR against a local remote):
  ```bash
  curl -X POST localhost:8090/auto-fix -H 'content-type: application/json' \
    -d '{"error_pattern":"describe the bug and the file it lives in"}'
  ```

Every agent run is also a trace in Tempo (Explore → Tempo, search `service.name=agent-service`):
the `agent.<kind>` parent span with a `tool.<name>` child per tool call.

> The agent-service binds IPv4; the web's `AGENT_SERVICE_URL` defaults to
> `http://127.0.0.1:8090` (on Windows, `localhost` may resolve to IPv6 first and refuse
> the BFF's server-side fetch).

### Run chaos, SLOs & the incident demo (Phase 6)

With the full lab up (subject + observability) and the agent-service on the host:

```bash
# Scheduled chaos on a clock (full 26-min cycle; drives the SLO burn-rate alerts).
bun run chaos:run                       # apps/load-generator/chaos/full.yaml

# The keystone: one on-purpose incident, end to end (~6-8 min). Injects a chaos
# error burst, waits for the reporter's postmortem in the incident inbox, then
# runs an RCA follow-up. Needs the agent-service on :8090 (it can't auto-start it).
bun run demo:incident
```

The SLO specs live in `slo/*.yaml`; recording rules in `infra/mimir/rules/anonymous/`; burn-rate
and cardinality alerts in `infra/grafana/provisioning/alerting/rules.yaml`. Cardinality scrubbing
and tail sampling are in `infra/alloy/config.alloy`. Continuous profiling is **opt-in** (needs a
host with eBPF/BTF):

```bash
docker compose -f infra/compose.yml -f infra/compose.observability.yml \
  --profile profiling up -d alloy-profiler   # then open Grafana → "Gateway · Profiles"
```

New in Grafana: SLO burn-rate + cardinality alerts, a **Frontend (browser RUM)** row on the
gateway dashboard, and a **Profiles** flame-graph dashboard (Pyroscope on :4040). A plain-language
walkthrough is in `docs/phase-6-explained.html`.

### Service addresses (after `docker compose up`)

| Service       | Address               | Credentials       |
| ------------- | --------------------- | ----------------- |
| Control plane | http://localhost:3003 | dev mode, no auth |
| Grafana       | http://localhost:3001 | anonymous (Admin) |
| Marquez UI    | http://localhost:3002 |                   |
| Gateway API   | http://localhost:8080 |                   |
| dq-runner     | http://localhost:8091 |                   |
| Agent service | http://localhost:8090 |                   |

## The plan

The full phased implementation plan — Phase 0 through Phase 6 — lives in `docs/PLAN.html` and is the authoritative source of truth. Each phase is implemented independently, building on the scaffold created in Phase 0.
