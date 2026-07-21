# AI Observability Lab

A free learning lab where a small AI inference gateway becomes the subject of full-spectrum observability. The gateway serves a real RAG pipeline (embedder → pgvector retriever → mock LLM) and emits logs, metrics, distributed traces, data-lineage events, and data-quality signals. Claude agents then read that telemetry — Grafana dashboards, Tempo traces, Marquez lineage, Postgres — to diagnose problems, write postmortems, and trigger remediations behind approval gates.

**Act I** (phases 0–6) runs everything in local Docker Compose. **Act II** (phases 7+) moves the subject system onto a real k3d Kubernetes cluster on a small remote VM, reached over Tailscale — while the observability plane and the agents stay on the laptop, which becomes the on-call workstation. Every byte of telemetry flows back home, so no amount of cluster mayhem can destroy the evidence.

## What's inside

- **Subject system** — Bun services (gateway, embedder, retriever, model-proxy) with bearer-token auth, per-tenant rate limiting, usage metering, and a load generator with a chaos fault model
- **Application observability** — manual OpenTelemetry → Grafana Alloy → Loki / Tempo / Mimir, with provisioned RED + RAG dashboards, exemplars, service map, and tail-based sampling
- **Data observability** — every request is an OpenLineage run in Marquez; a Python dq-runner checks freshness / volume / drift / schema / cache every 30s
- **Control plane** — a TanStack Start web app (`:3003`): golden signals, embedded Grafana/Marquez, incident inbox, runbooks, and a streaming agent chat with live tool calls and artifacts
- **Claude agents** — a host-side FastAPI service (`:8093`, Claude Agent SDK) with five agents: RCA assistant, incident reporter, dashboard generator, runbook executor (per-step approvals), and auto-fixer (PR behind an approval gate). Every run is itself a Tempo trace.
- **Chaos & SLOs** — a clock-driven chaos scheduler, SLO specs compiled to Mimir recording rules, multi-window burn-rate alerts, browser RUM, opt-in eBPF profiling, and a one-command incident demo
- **Kubernetes (Act II)** — the subject system runs as pods in a k3d cluster (1 tainted server + 2 killable agents) on a cheap cloud VM; `infra/ports.env` is the single address book, `obs k8s` wraps the whole lifecycle, and the agents get a read-only cluster identity (`agent-ro`)
- **K8s observability** — the grafana/k8s-monitoring chart ships cluster state (kube-state-metrics), container usage (cAdvisor), Kubernetes events, and pod logs into the same Mimir/Loki; kubernetes-mixin dashboards (job labels aligned), 8 fast cause-alerts (CrashLooping, OOMKilled, ImagePullBackOff…) wired to the agent webhook, a cardinality-budget dashboard, and a read-only cluster window for the agents (kubernetes-mcp-server + shaped `k8s_events` / `kubectl_read` tools — Secrets denied by construction)
- **Local CI/CD (Act II)** — Gitea 1.26 + Actions runner + a Bun `ci-shim` on the VM (`infra/compose.ci.yml`, `obs ci`): `git push gitea main` tests, builds, pushes `:sha` images to the k3d registry, and deploys — with the pipeline itself observable: each completed run lands as ONE post-hoc Tempo trace (OTel CI/CD semconv, per-step spans, immune to the 10s tail-sampling window), DORA metrics in Mimir (`CI/CD · Delivery` dashboard: deploy frequency, lead time, change failure rate, MTTR), per-service deploy annotations on the RED dashboards, `cicd-pipeline-red` / `cicd-queue-stall` alerts, a push-mirror keeping GitHub in sync, and delivery-history agent tools (`gitea_ci_runs`, `gitea_compare` with diffs, `grafana_annotations`, `gitea_open_pr`) — so the agent can walk alert → deploy marker → CI run → the exact commit

## Prerequisites

- **Docker Desktop** (the lab is ~15 containers)
- **Bun** ≥ 1.1 (workspaces + Turborepo)
- **uv** (Python; for the agent-service)
- **Claude Code** logged in on this machine — the agent-service authenticates the Claude Agent SDK against your local session; no API key needed
- **For the Act II k8s mode only**: `kubectl` locally, plus a small Linux VM (4 vCPU / 8 GB, Docker + k3d + Tailscale — see `infra/vm/`) on the same tailnet

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
obs agents           # 2. agent-service :8093  (own terminal, Ctrl-C to stop)
obs web              # 3. web control plane :3003  (own terminal, Ctrl-C to stop)
obs load 120 300     # 4. synthetic traffic so dashboards populate
```

The full lab is those three pieces: **containers + `obs agents` + `obs web`**. The two host processes run outside compose so the Agent SDK can use your Claude Code login and the web app can hot-reload.

### `obs` command reference

| Command                  | What it does                                                                                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `obs all [qps] [secs]`   | Everything: containers, agent-service, web, and load, in their own windows                                                                                                                                                                                                                          |
| `obs up [--build]`       | Bring up the full lab (handles the compose network-ordering gotcha)                                                                                                                                                                                                                                 |
| `obs down [-v]`          | Tear it down (`-v` also wipes volumes: seeded data + Grafana state)                                                                                                                                                                                                                                 |
| `obs load [qps] [secs]`  | Drive synthetic traffic (defaults 120 qps / 300s)                                                                                                                                                                                                                                                   |
| `obs demo [qps] [secs]`  | Full cycle: up --build → wait healthy → load → down                                                                                                                                                                                                                                                 |
| `obs web` / `obs agents` | Run a host process in the current terminal                                                                                                                                                                                                                                                          |
| `obs fail <scenario>`    | Failure drills with baseline traffic: 8 compose chaos scenarios, the k8s-native `pod-kill`, `oomkill`, `imagepull`, `crashloop`, `readiness-break`, and the delivery-native `bad-deploy`, `canary-bad-image`, `config-drift`, `sync-fail` (each declares `inject_mode: git\|live`; all auto-revert) |
| `obs k8s <sub>`          | Act II cluster lifecycle on the VM: `up` `down` `status` `build` `deploy` `smoke` `monitoring` (k8s-monitoring chart) `argo` (Argo CD + Rollouts + Applications + webhook route) `agent-kubeconfig` `node-stop/start`                                                                               |
| `obs ci <sub>`           | Act II CI layer on the VM: `up` (ship source, bootstrap Gitea admin/token/webhook/runner) `down` `logs` `token` `status`                                                                                                                                                                            |
| `obs gitops <sub>`       | Act II desired-state repo (`obs/obs-gitops`): `init` (seed from `infra/gitops`) `push` (operator override) `status` (Applications table) `smoke` (the canary-hash gate)                                                                                                                             |
| `obs argocd`             | Argo CD UI on :8443 (port-forward + admin password + browser)                                                                                                                                                                                                                                       |
| `obs rollouts`           | Argo Rollouts dashboard on :3105 (laptop-side kubectl plugin)                                                                                                                                                                                                                                       |
| `obs names [install]`    | Register `https://obs-*.localhost` aliases for the human-facing endpoints                                                                                                                                                                                                                           |
| `obs preflight`          | Check required binaries and every port in `infra/ports.env`                                                                                                                                                                                                                                         |
| `obs smoke`              | Phase-1 end-to-end smoke test                                                                                                                                                                                                                                                                       |
| `obs ps` / `obs logs`    | Container status / follow logs                                                                                                                                                                                                                                                                      |
| `obs urls` / `obs hosts` | Print the address table / host-process commands                                                                                                                                                                                                                                                     |

### Without the wrapper (macOS / Linux)

```bash
bash scripts/dev-up.sh --build                                  # containers (all three planes)
(cd apps/agent-service && uv sync && uv run python -m agent_service)  # :8093
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
| Agent service | http://localhost:8093 | host process               |
| dq-runner     | http://localhost:8091 | `/violations`, `POST /run` |
| Pyroscope     | http://localhost:4040 | profiles (opt-in profiler) |

Every host-published port lives in **`infra/ports.env`** — a collision with another project is a one-line remap there, and everything (compose, obs.ps1, the k3d config) follows. In k8s mode the gateway answers at the VM's tailnet name on the same `:8080`.

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
  curl -X POST localhost:8093/webhook/grafana-alert -H 'content-type: application/json' \
    -d '{"status":"firing","alerts":[{"status":"firing","labels":{"alertname":"Gateway 5xx rate > 2%","severity":"page"},"annotations":{"summary":"gateway 5xx above 2%"}}]}'
  ```
- **Generate a Grafana dashboard** from a natural-language brief:
  ```bash
  curl -X POST localhost:8093/generate-dashboard -H 'content-type: application/json' \
    -d '{"brief":"gateway health: request rate, p95 latency, and 5xx share over time"}'
  ```
- **Run a runbook with approvals**: http://localhost:3003/runbooks → "run with executor", then approve/deny each step on the run page.
- **The keystone demo** — one on-purpose incident end to end (~6–8 min): injects a chaos error burst, waits for the reporter's postmortem in the incident inbox, then runs an RCA follow-up (needs the agent-service up):
  ```bash
  bun run demo:incident
  ```
- **Scheduled chaos** (full 26-min timeline that drives the SLO burn-rate alerts): `bun run chaos:run`
- **Break the cluster** (k8s mode): `obs fail oomkill` drops the retriever's memory limit to 64Mi under load — watch the working-set graph flat-top at the new ceiling, the `KubeContainerOOMKilled` alert fire, and the incident-reporter's postmortem distinguish "killed for exceeding its allowance" from "crashed" (~2 min from fault to agent-on-the-case). `crashloop`, `imagepull`, and `readiness-break` tell the other classic Kubernetes failure stories; all revert themselves.
- **Ask the agent about the cluster**: "describe the gateway deployment and its recent events" — answered through read-only cluster tools only (`k8s_events` timelines, caged `kubectl_read`, the k8s MCP server). Ask it to read a Secret and watch three independent layers refuse.
- **Follow the telemetry**: in Grafana, click a latency exemplar on the RED dashboard to jump to its Tempo trace, then "Logs for this span" to land on the matching `trace_id` in Loki. Every agent run is also a trace (`service.name=agent-service`).

> **Windows note:** the agent-service binds IPv4; the web app defaults to `http://127.0.0.1:8093` because `localhost` may resolve to IPv6 first and refuse the connection.

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
  agent-service/    # Python + Claude Agent SDK — the five agents (:8093)
  dq-runner/        # Python — scheduled data-quality checks (:8091)
packages/
  contracts/        # shared types + Zod schemas (incl. the agent wire contract)
  domain/           # pure domain logic
  telemetry/        # @obs/telemetry — OTel init + manual instrumentation helpers
  lineage/          # @obs/lineage — OpenLineage builders + Marquez emitter
  ui/ tsconfig/     # design tokens, shared tsconfig presets
infra/
  ports.env                    # THE address book — every host-published port, one file
  compose.yml                  # subject system (Postgres, Redis, TS services, seed, load)
  compose.observability.yml    # Alloy + Loki/Tempo/Mimir + Grafana + Pyroscope
  compose.lineage.yml          # Marquez + dq-runner
  gitops/                      # Act II: desired-state seed (platform + per-service
                               #   sync roots) - runtime truth is Gitea obs/obs-gitops
  k8s/                         # Act II: k3d config, cluster bootstrap, k8s-monitoring
                               #   values, Argo CD/Rollouts values + Application CRs
  vm/                          # obs-vm provisioning (cloud-init, tailnet NAT unit)
  grafana/mixins/              # kubernetes-mixin dashboard build (jsonnet, dockerized)
slo/                # SLO specs (source of truth for recording rules + alerts)
runbooks/           # Markdown runbooks the executor agent walks with approvals
scripts/            # obs.ps1 (the CLI), k8s-build.ps1, dev-up.sh, smoke.sh, demo-incident.sh
```

## Docs

The phased plans (Act I and Act II), ADRs, and plain-language explainers are kept in a local-only `docs/` folder that is deliberately not tracked in this repo. The operator-facing documentation that ships here lives in the per-component `README.md` files under `infra/`, `apps/`, and `scripts/`.
