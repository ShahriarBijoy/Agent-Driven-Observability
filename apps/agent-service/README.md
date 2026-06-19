# agent-service

The Claude Agent SDK host for the AI Observability Lab (Phase 5). It runs the
five agents that read the telemetry plane and act on it (incident reporter, RCA
assistant, dashboard generator, runbook executor, auto-fixer), exposes a
streaming HTTP API, persists every run to Postgres as an audit trail, and emits
its own OpenTelemetry traces.

It is the real backend behind the Phase-4 web control plane: the wire format is
`@obs/contracts` (`packages/contracts/src/agents.ts`), so the web BFF swaps its
in-memory echo agent for this service without any change above the seam.

## API

| Method + path | Purpose |
| --- | --- |
| `GET /health` | liveness |
| `POST /chat` | interactive SSE run (echo, rca) — body is `AgentChatRequest` |
| `GET /runs?tenant=` | `AgentRunSummary[]` |
| `GET /runs/:id` | full `AgentRun` |
| `GET /runs/:id/stream` | follow a run's SSE events live (with replay) |
| `POST /runs/:id/approve` | resolve an approval gate, returns `AgentRun` |

Triggered entrypoints (`/generate-dashboard`, `/webhook/grafana-alert`,
`/runbooks/:name/execute`, `/auto-fix`) are added per agent milestone.

Events stream as SSE frames of `AgentStreamEvent` JSON
(`run` / `token` / `tool_call` / `approval_required` / `done` / `error`).

## Running

Managed with [uv](https://docs.astral.sh/uv/). Python 3.11+.

```bash
uv sync
# Needs Postgres (the lab's compose `postgres` service) reachable at DATABASE_URL.
uv run python -m agent_service
```

Defaults (see `.env.example`) target host dev against the local compose stack.
The Agent SDK authenticates against your local Claude Code CLI session — no API
key required.

```bash
uv run pytest   # unit tests for the wire contract + tool validators
```

## Self-observability

The service instruments itself with the OTel Python SDK and exports OTLP/HTTP to
Alloy (`OTEL_EXPORTER_OTLP_ENDPOINT`). Every model-backed run is one trace:

```
agent.<kind>            (parent span — the whole run)
├─ tool.loki_query      (child span per tool call, with tool.status)
├─ tool.mimir_query
└─ tool.save_artifact
```

So an agent run shows up in Tempo exactly like any other service's request —
agents you can't see in your traces are agents you can't trust. FastAPI, httpx,
and asyncpg are auto-instrumented too.

## Persistence

Five tables, provisioned by `infra/postgres/init/03-agents.sql` and also ensured
at startup: `agent_runs`, `agent_messages`, `agent_tool_calls`, `agent_approvals`,
`agent_artifacts`. Postgres is the source of truth for `GET /runs`; an in-memory
hub handles live SSE fan-out and the approval rendezvous.
