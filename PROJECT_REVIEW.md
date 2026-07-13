# AI Observability Lab — Project Review

Repo: `W:\personal-code\observability-tools` → private GitHub `ShahriarBijoy/Agent-Driven-Observability` (main). Review generated 2026-07-06; all facts verified against the working tree and git history unless marked [VERIFY].

## 1. One-paragraph summary

A complete, locally-runnable "AI Observability Lab": a Bun/TypeScript AI inference gateway with a real RAG pipeline (embedder → pgvector retriever → mock model-proxy) is instrumented end-to-end with OpenTelemetry and observed through the full Grafana LGTM stack (Alloy → Loki/Tempo/Mimir + Grafana), OpenLineage/Marquez data lineage, and a Python data-quality runner. On top of that telemetry plane sit five Claude Agent SDK agents (RCA assistant, incident reporter, dashboard generator, runbook executor, auto-fixer) that read the observability backends via a 10-tool MCP toolkit, stream over SSE into a TanStack Start control-plane UI, persist to a Postgres audit schema, and are themselves traced in Tempo. Phase 6 adds chaos engineering (runtime fault control planes + a YAML-scheduled chaos runner), three SLOs compiled into Mimir recording rules and multi-window multi-burn-rate Grafana alerts, cardinality control, tail-based trace sampling, opt-in eBPF continuous profiling (Pyroscope), browser RUM, and a one-command synthetic-incident demo.

## 2. Timeline

- **First commit:** 2026-05-27 (`26858a0` Initial commit). **Last commit:** 2026-07-01 (`d4ebfd4`, merge of PR #6). Status: complete (all planned phases merged).
- **Total commits:** 48 on `main`. **6 merged PRs** (one per phase 1–6); phases 1–6 each built on a feature branch/worktree.
- **Phases** (per `docs/PLAN.html`, ADRs, and commit messages):
  - **Phase 0 — Foundation** (2026-05-31): Bun workspaces + Turborepo monorepo scaffold, oxlint/oxfmt, Vitest, GitHub Actions CI, compose skeleton. ADR-001.
  - **Phase 1 — Subject system** (2026-05-31, PR #1): gateway/embedder/retriever/model-proxy + seed + load-generator. ADR-002.
  - **Phase 2 — Application observability** (2026-06-02, PR #2): `@obs/telemetry`, Alloy + LGTM compose, dashboards, first 2 alerts. ADR-003.
  - **Phase 3 — Data observability** (2026-06-04, PR #3): `@obs/lineage` (OpenLineage), Marquez, Python dq-runner, DQ dashboard/alerts. ADR-004.
  - **Phase 4 — Frontend control plane** (2026-06-09, PR #4): TanStack Start app on :3003, SSE agent chat seam, Grafana/Marquez embeds, browser OTel.
  - **Phase 5 — Claude agents** (2026-06-19, PR #5, 11 milestone commits): FastAPI + Claude Agent SDK `agent-service` on host :8090, five agents, audit schema, approvals.
  - **Phase 6 — Chaos, SLOs & production polish** (2026-07-01, PR #6, 10 task commits): chaos scheduler, SLOs/burn-rate alerts, cardinality + tail sampling, Pyroscope eBPF, RUM, demo script. ADR-005.

## 3. Architecture

Three planes plus a control plane; containers in Docker Compose, two processes on the host.

```
                       ┌──────────── SUBJECT SYSTEM (infra/compose.yml) ────────────┐
 load-generator ──►  gateway :8080 ──► embedder :8081 ──► retriever :8082 (pgvector top-k)
 (weighted chaos      │ bearer auth, Redis rate-limit,     └─► Postgres(pgvector) + Redis
  traffic + YAML      │ usage metering, OpenLineage runs  ──► model-proxy :8083 (mock LLM,
  chaos scheduler)    ▼                                        fault model, /admin/chaos)
              OTLP (traces/metrics/logs)
                       ▼
 ┌──────────── OBSERVABILITY PLANE (infra/compose.observability.yml) ─────────────┐
 │ Grafana Alloy (scrub attrs, tail-sample) ─► Loki 3.7.2 (logs)                  │
 │                                          ─► Tempo 3.0.0 (traces + span-metrics)│
 │                                          ─► Mimir 3.1.0 (metrics, SLO rules)   │
 │ Pyroscope 1.14.0 (eBPF profiler, opt-in) ─► Grafana 13.0.1 :3001 (4 dashboards,│
 │                                              10 alert rules, anonymous admin)  │
 └─────────────────────────────────────────────────────────────────────────────────┘
 ┌──────────── DATA PLANE (infra/compose.lineage.yml) ────────────────────────────┐
 │ Marquez 0.50.0 (API + UI :3002 + own Postgres) ◄─ OpenLineage events           │
 │ dq-runner :8091 (Python: 5 checks / 30s) ─► dq_* metrics ► Mimir;              │
 │                                             violations ► Postgres              │
 └─────────────────────────────────────────────────────────────────────────────────┘
 HOST: web :3003 (TanStack Start BFF, SSE) ──► agent-service :8090 (FastAPI +
       Claude Agent SDK; 5 agents; 10 MCP tools querying Loki/Tempo/Mimir/
       Marquez/Postgres/Grafana; Postgres audit tables; OTel traces → Tempo)
       Grafana alert contact point ──webhook──► agent-service /webhook/grafana-alert
```

The agent-service deliberately runs on the host (not in compose) so the Claude Agent SDK authenticates against the local Claude Code session — no `ANTHROPIC_API_KEY` needed (README §Phase 5).

## 4. Full tech stack

- **Languages:** TypeScript (strict, `typescript ^6.0.3`), Python (>=3.11), PowerShell + Bash (ops scripts), SQL, Alloy config language, PromQL/LogQL/TraceQL.
- **Runtime / build:** Bun (>=1.2, packageManager bun@1.3.8) workspaces, Turborepo ^2.9.16, uv (Python package manager), Hono ^4.12.23 (HTTP framework for TS services), `@hono/zod-openapi` (OpenAPI routes), Zod v4.
- **Frontend:** TanStack Start ^1.0 (React ^19.2), Vite ^7, Tailwind CSS ^4.1, custom `@obs/ui` design-token package; SSE streaming UI; `web-vitals` for RUM.
- **Databases / stores:** Postgres 16 (`pgvector/pgvector:pg16`) via Drizzle ORM + postgres.js (TS) and asyncpg/psycopg (Python); Redis 7 (embedding cache + token-bucket rate limiting, ioredis); Postgres 14 (Marquez's own DB).
- **AI/LLM tooling:** Claude Agent SDK (`claude-agent-sdk>=0.1.0`, Python) with in-process MCP server (`create_sdk_mcp_server`); auth via local Claude Code CLI session (no API key). Model-proxy is a deterministic **mock** LLM (no external model calls in the subject system). Embeddings: deterministic reference embedder producing 384-dim vectors [VERIFY exact embedding algorithm].
- **Observability:** OpenTelemetry JS (api 1.9.1, SDK 2.7.1, experimental 0.218.0 — manual instrumentation, Bun-compatible), OpenTelemetry Python (SDK >=1.27 + FastAPI/httpx/asyncpg auto-instrumentation); Grafana Alloy v1.16.2, Loki 3.7.2, Tempo 3.0.0 (metrics-generator span-metrics for exemplars), Mimir 3.1.0, Grafana 13.0.1, Pyroscope 1.14.0 (eBPF); OpenLineage (RunEvent spec 2-0-2) + Marquez 0.50.0.
- **Data quality:** FastAPI + APScheduler, scipy (`ks_2samp` Kolmogorov–Smirnov drift test).
- **Infrastructure:** Docker Compose (3 layered files, shared external networks, healthchecks, profiles `load`/`profiling`), single shared `infra/Dockerfile` for the four TS services.
- **Auth:** dev bearer tokens with a 3-tenant registry (acme/bravo/abuser); per-tenant Redis token-bucket rate limits. Grafana anonymous-admin (local lab).
- **Testing / quality:** Vitest ^3.2 (TS), pytest (+pytest-asyncio) (Python), oxlint ^1.67, oxfmt 0.52, `tsc --noEmit`, `promtool check rules`, `alloy fmt`; GitHub Actions CI (lint, format, typecheck, test).
- **Deployment target:** local Docker Compose only (learning lab); private GitHub repo.

## 5. What I built — the complete list

- **Bun/Turborepo monorepo scaffold (Phase 0)** — workspaces `apps/*` + `packages/*`, shared tsconfig presets (`packages/tsconfig`), oxlint/oxfmt, Vitest workspace, GitHub Actions CI (lint & format, typecheck, test — `.github/workflows/`), `.env.example`, layered compose skeleton. ADR: `docs/adr/001-monorepo-and-vertical-slices.md`.
- **AI inference gateway + RAG subject system (Phase 1)** — 4 Bun/Hono services in `apps/gateway|embedder|retriever|model-proxy`, each with `platform/{config,errors,http}.ts` plus vertical slices (ports/adapters/handlers). Gateway slices: `auth/`, `inference/`, `rate-limit/`, `usage-metering/`. Retriever: pgvector top-k over a ~1,000-chunk seeded Gutenberg corpus (IVFFlat index built post-load, `apps/retriever/src/seed/`). Model-proxy: deterministic mock LLM with a rich fault model (`apps/model-proxy/src/slices/complete/faults.ts`). Bearer-token auth with 3 dev tenants, per-tenant Redis token-bucket rate limiting, Postgres usage metering. Load-generator drives weighted chaotic traffic (`apps/load-generator`); 113 req/s sustained in Phase 1 acceptance (memory note; [VERIFY] not re-run here). ADR-002.
- **`@obs/telemetry` — manual OTel instrumentation for Bun (Phase 2)** — `packages/telemetry`: OTel SDK init + `honoTelemetry` server-span middleware, `tracedFetch` (W3C context propagation → service-map edges), `withSpan`, `createLogger`; OTLP export of traces/metrics/logs. Needed because OTel auto-instrumentation does not work on Bun (native fetch/Bun.serve not patchable). ADR-003.
- **Grafana LGTM observability plane (Phase 2)** — `infra/compose.observability.yml` (Alloy, Loki, Tempo, Mimir, Grafana, Pyroscope, opt-in alloy-profiler); Alloy pipeline `infra/alloy/config.alloy`; fully provisioned Grafana: cross-linked datasources with metric→trace (exemplars), trace→logs (tracesToLogsV2), trace→metrics/serviceMap, log→trace (derived fields), trace→profiles (`infra/grafana/provisioning/datasources/datasources.yaml`); **Gateway · RED** and **RAG Pipeline** dashboards (`provisioning/dashboards/*.json`); alert rules + contact points + notification policies as code (`provisioning/alerting/`). Exemplars sourced from Tempo's metrics-generator span-metrics (OTel-JS metric exemplars non-functional in sdk-metrics 2.7.1); app metrics shipped OTLP-direct to Mimir.
- **`@obs/lineage` + OpenLineage/Marquez data lineage (Phase 3)** — `packages/lineage`: typed OpenLineage RunEvent builders (spec 2-0-2, ParentRunFacet 1-1-0) + best-effort Marquez emitter. Gateway emits one `rag.inference` run per `/v1/chat`; embedder/retriever emit `rag.embed`/`rag.retrieve` sub-runs linked via parent-run facet, propagated through `AsyncLocalStorage` parent context → `x-ol-parent-*` HTTP headers. Gateway records each successful chat to an `inferences` table (`infra/postgres/init/02-data-observability.sql`). Marquez compose (`infra/compose.lineage.yml`, UI :3002). ADR-004.
- **Python dq-runner (Phase 3)** — `apps/dq-runner`: FastAPI + APScheduler service running 5 data-quality checks every 30s (freshness, volume, distribution drift via scipy `ks_2samp`, schema, cache health — `src/dq_runner/checks/`); pushes `dq_*` OTLP metrics to Mimir via Alloy; persists violations to a `dq_violations` table; endpoints incl. `/violations`, `POST /run` (:8091). **Data Quality** Grafana dashboard + 2 DQ alert rules.
- **TanStack Start control plane (Phase 4)** — `apps/web` (:3003): 7 routes (`/`, `/telemetry`, `/lineage`, `/agents`, `/incidents`, `/runbooks`, `/settings`). Home reads golden signals live from Mimir + recent incidents/agent runs from Postgres; Grafana (kiosk) and Marquez embedded in iframes driven by a shared time-range control; `/agents` streams SSE chat with a live tool-call timeline and a working approval gate; `/incidents` renders Markdown postmortems; `/runbooks` launches the runbook executor. `packages/ui` design-token theme; browser instrumented with the OTel web SDK → Alloy (frontend fetch spans join gateway traces). Agent wire contract (runs/stream events/approvals) in `@obs/contracts`.
- **agent-service: five Claude Agent SDK agents (Phase 5)** — `apps/agent-service` (FastAPI + claude-agent-sdk, uv, host :8090, 10 HTTP endpoints incl. `POST /chat` SSE, `/generate-dashboard`, `/webhook/grafana-alert`, `/runbooks/{name}/execute`, `/auto-fix`, `/runs/{id}/stream`, `/runs/{id}/approve` — `src/agent_service/app.py`). Agents (`agents/*.py`): **RCA assistant** (interactive, read-only telemetry queries), **incident reporter** (Grafana alert webhook → Markdown postmortem + `incidents` row), **dashboard generator** (NL brief → real Grafana dashboard via API), **runbook executor** (walks `runbooks/*.md` with blocking per-step approvals), **auto-fixer** (edits code in a contained clone under `.artifacts/autofix/`, opens a PR behind an approval gate). Shared 10-tool MCP toolkit (`tools/sdk.py`): `loki_query`, `tempo_query`, `mimir_query`, `marquez_lineage`, `pg_select`, `grafana_create_dashboard`, `runbook_read` (stateless) + `gh_open_pr`, `request_approval`, `save_artifact` (per-run closures); agents differ only by system prompt + `allowed_tools` (`TOOLSETS` map). Durable audit: 5 agent tables + `incidents` in Postgres (`infra/postgres/init/03-agents.sql`). In-memory `RunHub` (`hub.py`) does SSE fan-out with replay buffer and the blocking approval rendezvous (an `asyncio.Future` parked until `POST /runs/:id/approve`). Agent self-observability: each run is an OTel `agent.<kind>` parent span with `tool.<name>` child spans, visible in Tempo. `save_artifact` filename sanitization (path-traversal fix). Verified live end-to-end (commit `3f38552` "verified live end-to-end").
- **Chaos engineering (Phase 6)** — dev-only runtime `/admin/chaos` control planes on model-proxy (error bursts, latency spikes) and retriever (outage/brownout → gateway 502s), gated by `CHAOS_CONTROL_ENABLED`; clock-driven chaos scheduler in the load-generator (`bun run chaos:run`, `apps/load-generator/src/chaos/`, YAML timelines `chaos/full.yaml` 26-min cycle + `chaos/demo.yaml`) that drives baseline traffic, applies/clears fault phases, and always resets in `finally`.
- **SLOs + multi-window multi-burn-rate alerting (Phase 6)** — 3 source-of-truth SLO specs in `slo/*.yaml` (availability 99.5%/28d, latency 95% < 1.5s, RAG quality 90% top-1 score ≥ 0.6), compiled into 16 Mimir recording rules (`infra/mimir/rules/anonymous/slo-gateway.yaml` 13 + `slo-rag.yaml` 3) and Google-SRE-workbook burn-rate Grafana alerts (fast-burn pages / slow-burn tickets) routed to the incident-reporter webhook. Required telemetry changes: new 1.5s histogram boundary in `@obs/telemetry`, new `retrieval_top_score` histogram in the gateway.
- **Cardinality control + tail-based sampling (Phase 6)** — Alloy `otelcol.processor.attributes "scrub"` deletes `user_id`/`request_id`/`session_id` from metrics only; `otelcol.processor.tail_sampling` keeps every error/slow trace + a share of the rest; Mimir per-tenant series cap + Alloy self-scrape of Mimir's `/metrics` feeding a "Mimir dropping series" alert. (`infra/alloy/config.alloy`.)
- **Continuous profiling via eBPF (Phase 6)** — opt-in privileged Alloy profiler (`infra/alloy/profiler.alloy`, compose `profiling` profile) ships `process_cpu` profiles to Pyroscope; Tempo `tracesToProfiles` span→flame-graph drill-down; **Profiles** dashboard. eBPF chosen because Bun runs JavaScriptCore, so the V8-based `@pyroscope/nodejs` SDK cannot profile it.
- **Browser RUM (Phase 6)** — real OTel metrics from the browser (`browser_http_requests_total`, LCP/INP via `web-vitals`) + a "Frontend" dashboard row; metrics (not span-derived) because tail sampling would bias span-metrics.
- **Ops tooling & docs** — `scripts/obs.ps1` PowerShell CLI (`obs up/down/load/demo/ps/logs/urls/smoke/hosts/web/agents`) encoding the network-safe two-step startup; `scripts/dev-up.sh`, `scripts/smoke.sh` (one-command health+seed+RAG assertion), `scripts/demo-incident.sh` (`bun run demo:incident`: injects chaos, polls the `incidents` table for the agent-written postmortem, streams an RCA follow-up); 3 Markdown runbooks (`runbooks/`); 5 ADRs (`docs/adr/`); 5 plain-language HTML explainers + `docs/PLAN.html` build plan + `docs/commands.html` cheat sheet + `docs/learning-notes.md`.

## 6. Hard problems solved

- **OTel auto-instrumentation doesn't work on Bun** — Bun's native `fetch`/`Bun.serve` aren't monkey-patchable and ESM hooks are unavailable; solved with a hand-built manual instrumentation layer (`@obs/telemetry`: middleware spans, traced fetch with W3C propagation, log correlation). (ADR-003, memory.)
- **Broken metric exemplars in OTel-JS** — `sdk-metrics@2.7.1` exemplar filter is a no-op; solved by sourcing exemplars from Tempo's metrics-generator span-metrics (`traces_spanmetrics_latency_bucket` carries `traceID`) and sending app metrics OTLP-direct to Mimir (Alloy's Prometheus exporter drops exemplars). (ADR-003, memory.)
- **Compose external-network startup ordering** — merging the three compose files fails on a fresh machine (`network obs-lab-app declared as external, but could not be found`) because `compose.lineage.yml` re-declares the networks as `external: true` and wins the merge; diagnosed via `docker compose config` and encoded the safe two-step bring-up in `scripts/obs.ps1` (`obs up`). (Memory: compose-network-startup-order.)
- **Windows `localhost` → IPv6-first refusals** — uvicorn binds IPv4 only, so the web BFF's server-side fetch to `localhost:8090` was refused; fixed by defaulting `AGENT_SERVICE_URL` to `http://127.0.0.1:8090` (`apps/web/src/server/env.ts`). (Memory; README note.)
- **Host-dev vs Docker port conflicts** — host `bun run dev` and the Docker subject system both bind 8080–8083; operationalized stopping the Docker app services while keeping Postgres+Redis. (Memory: host-dev-vs-docker-port-conflict.)
- **Blocking human-in-the-loop approvals inside an agent run** — `request_approval` parks the agent's tool call on an `asyncio.Future` in the RunHub until a human hits `POST /runs/:id/approve` from the UI; combined with SSE replay buffering so late subscribers see the full run. (`apps/agent-service/src/agent_service/hub.py`.)
- **Safe autonomous code changes** — the auto-fixer operates in a contained clone whose origin is a local bare repo, behind an approval gate; `save_artifact` filenames sanitized to a contained basename after a path-traversal finding in commit review. (`agents/autofix.py`, commit `dc676fd`.)
- **Mimir ruler tenancy quirk** — with `multitenancy_enabled: false` the ruler's local storage still requires rules under an `anonymous/` tenant subdirectory (`infra/mimir/rules/anonymous/`). (ADR-005, memory.)
- **Burn-rate alerting without Alertmanager** — Mimir ruler only records; burn-rate alerts live in Grafana, with the multi-window AND condition encoded in a single PromQL expression `(short > bool T) * (long > bool T) > 0`. Also derived that a loose 90% SLO mathematically cannot use burn-rate thresholds (threshold > 1.0) and documented the fallback (alert on SLI below objective). (`slo/rag-quality.yaml`, ADR-005.)
- **Profiling a non-V8 runtime** — Bun uses JavaScriptCore, so Node/V8 profilers can't attach; solved with an opt-in privileged eBPF Alloy profiler shipping `process_cpu` to Pyroscope. (ADR-005, README.)
- **Tail-sampling bias** — recognized that tail-sampled span-metrics would skew RED/SLO numbers, so primary SLIs and browser RUM read unsampled service-emitted histograms instead of Tempo span-metrics. (ADR-005, README.)
- **Marquez container entrypoint bug** — shipped compose entrypoint referenced a non-existent wait-for-it path; fixed by using the image default (commit `39d9081`).
- **Windows MAX_PATH worktree cleanup** — `git worktree remove` fails on deep `node_modules` paths; resolved via robocopy empty-mirror trick + `git worktree prune`. (Memory; dev-process, not shipped code.)

## 7. Numbers

- **48 commits**, 6 merged phase PRs, 2026-05-27 → 2026-07-01 (~5 weeks).
- **19 services defined** across 3 compose files (8 subject: postgres, redis, gateway, embedder, retriever, model-proxy, seed, load-generator; 7 observability: alloy, loki, tempo, mimir, pyroscope, alloy-profiler, grafana; 4 lineage: marquez-db, marquez-api, marquez-web, dq-runner); 15 healthy in a steady-state full-lab bring-up confirmed 2026-06-30 (seed exits; load-generator and alloy-profiler are profile-gated) (memory).
- **7 TS apps + 2 Python apps**; 6 shared TS packages (`contracts`, `domain`, `telemetry`, `lineage`, `ui`, `tsconfig`).
- **~22,750 lines** of tracked source (excluding lockfile and HTML docs).
- **4 provisioned Grafana dashboards** (Gateway · RED, RAG Pipeline, Data Quality, Profiles) + a Frontend RUM row; **4 provisioned datasources** (Mimir, Loki, Tempo, Pyroscope), all cross-linked.
- **10 Grafana alert rules as code** (2 app, 2 DQ, 5 SLO burn-rate/objective, 1 cardinality) + provisioned contact points and notification policies.
- **3 SLOs** (`slo/*.yaml`) compiled into **16 Mimir recording rules** (13 gateway + 3 RAG), validated with `promtool check rules`.
- **5 Claude agents**, **10 shared agent tools**, **10 agent-service HTTP endpoints**, **6 agent/incident Postgres tables** across 3 init SQL files.
- **5 scheduled data-quality checks** every 30s.
- **37 test files** (28 Vitest TS + 9 pytest); memory records 107 tests passing at Phase 1 and 16/16 turbo tasks green at Phase 6 [VERIFY current total test count — not re-run in this read-only review].
- **7 web routes**; **2 chaos timelines** (26-min full cycle + compressed demo); **3 runbooks**; **5 ADRs**; ~1,000-chunk seeded vector corpus; 113 req/s sustained local load (Phase 1 acceptance, memory).

## 8. Experiments & decisions

- **Manual OTel instead of auto-instrumentation** — forced by Bun; became a deliberate design: one shared `@obs/telemetry` keystone package rather than per-service SDK setup. (ADR-003.)
- **Exemplars via Tempo span-metrics, metrics OTLP-direct to Mimir** — after finding OTel-JS exemplars and Alloy's Prometheus exporter both dropped them. (ADR-003.)
- **Agent-service on the host, not in Docker** — so the Claude Agent SDK reuses the local Claude Code session (subscription auth, no API key); backends stay containerized. (README, memory.)
- **One run loop + one toolkit for all five agents** — agents differ only in system prompt and tool allow-list, chosen over per-agent bespoke code for coherence; Phases 3/5/6 built solo/incrementally, while Phase 2 used an 8-parallel-subagent fan-out + verify pass (memory).
- **Postgres as audit source of truth + in-memory RunHub for live streaming** — durable record decoupled from SSE fan-out/replay and approval rendezvous. (Phase 5.)
- **Chaos as runtime control planes, not container restarts/env flips** — `/admin/chaos` endpoints merged per-request keep faults repeatable, resettable, and schedulable from YAML. (ADR-005.)
- **Burn-rate alerts in Grafana rather than Mimir ruler + Alertmanager** — avoided running Alertmanager; ruler records only. Rejected burn-rate alerting for the loose 90% RAG SLO after computing an impossible (>1.0) threshold — replaced with an SLI-below-objective alert. (ADR-005.)
- **eBPF profiling over language SDK** — `@pyroscope/nodejs` rejected (V8-only vs Bun's JavaScriptCore); opt-in privileged profiler so the default stack needs no special host capabilities. (ADR-005.)
- **RUM and SLO SLIs from unsampled service metrics, not span-derived metrics** — explicitly to avoid tail-sampling bias. (ADR-005.)
- **Mock LLM (model-proxy) as the subject** — deterministic, free, with a scripted fault model, so the observability signal is reproducible; Claude is used for the _agents_, not the inference path. (ADR-002 / README.)
- **Echo-agent seam in Phase 4** — shipped the UI against an in-BFF fake agent with the final wire contract in `@obs/contracts`, then swapped in the real service in Phase 5 behind the same `agent-client.ts` seam with zero UI changes.

## 9. Suggested CV bullets

- Built an end-to-end AI observability platform: a Bun/TypeScript RAG inference gateway (pgvector retrieval, Redis rate limiting, bearer-token multi-tenancy) instrumented with OpenTelemetry and observed through a 19-service Docker Compose Grafana LGTM stack (Alloy, Loki, Tempo, Mimir, Pyroscope, Grafana).
- Developed 5 autonomous LLM agents with the Claude Agent SDK (Python/FastAPI) — RCA assistant, incident reporter, dashboard generator, runbook executor, auto-fixer — sharing a 10-tool MCP toolkit that queries Loki/Tempo/Mimir/Marquez/Postgres, with SSE streaming, human-in-the-loop approval gates, a Postgres audit schema, and full self-tracing of agent runs in Tempo.
- Authored a manual OpenTelemetry instrumentation library for Bun (where auto-instrumentation is unsupported), delivering distributed traces with W3C propagation, RED metrics with trace exemplars, and correlated structured logs across 4 microservices.
- Implemented SLO engineering as code: 3 SLOs compiled into 16 Mimir recording rules and multi-window multi-burn-rate Grafana alerts (Google SRE method), wired to an LLM incident-reporter webhook that writes Markdown postmortems automatically.
- Built chaos-engineering tooling — runtime fault-injection control planes (error bursts, latency spikes, dependency outages) driven by a YAML-scheduled chaos runner — plus a one-command synthetic-incident demo that injects a fault and yields an agent-written postmortem and RCA.
- Modeled a RAG pipeline as a data pipeline with OpenLineage/Marquez (parent/child run lineage across services) and a Python data-quality service running 5 scheduled checks including Kolmogorov–Smirnov drift detection, exporting OTLP metrics and alerting in Grafana.
- Added production-grade telemetry controls: tail-based trace sampling, metric cardinality scrubbing with a series-cap alert, opt-in eBPF continuous profiling with trace-to-flame-graph correlation, and browser RUM (Core Web Vitals) feeding provisioned dashboards.
- Shipped with engineering rigor: 6 phase-based PRs, 5 ADRs, 37 test files (Vitest + pytest), GitHub Actions CI (lint/format/typecheck/test), provisioned-as-code Grafana (4 dashboards, 10 alert rules), and PowerShell/Bash ops CLIs.
