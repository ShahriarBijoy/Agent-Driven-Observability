# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single operator — the lab's author — working from one workstation. There are no
other roles, no accounts, no multi-tenancy in the human sense (the tenant registry
on `/settings` is a property of the _subject system_ being observed, not of the
people using this UI).

The situation is a live failure drill: a chaos scenario or `obs fail <scenario>` has
been fired, an alert is firing, and an autonomous agent is working the alert→close
loop. The operator's job is to follow what the system and the agents are doing fast
enough to judge it, and to approve or deny the mutating actions the agents propose.

There is no first-run flow, no onboarding, and no acquisition surface. The operator
already knows the domain.

## Product Purpose

`@obs/web` is the control plane for the AI Observability Lab: one page-set at
`:3003` that puts the lab's golden signals, incidents, agent runs, lineage,
runbooks, and approval gates in a single place, so the operator never has to
assemble the picture by hand across Grafana, Marquez, Tempo, and Postgres.

Success is comprehension under time pressure. During an incident the operator
should be able to answer, without leaving the app: what is broken, what an agent
believes about it, what it wants to do about it, and whether that action is safe to
allow.

## Positioning

Most observability UIs show you telemetry. This one shows you _an agent reasoning
over telemetry_ — the tool calls, the narration, the artifacts, and the proposed
remediation — as a first-class, streaming object alongside the signals themselves.
An agent run is a citizen of the UI, not a chat window bolted onto a dashboard.

The approval gate is the other half of that position: the app is the place where a
human decides whether an autonomous agent gets to touch production.

## Operating Context

- **Runs beside its dependencies, not inside them.** The full lab is three pieces:
  containers (`obs up`), the host agent-service on `:8093` (`obs agents`), and this
  app (`obs web`). Any of them can be absent while the others run.
- **The subject system is remote.** From Act II onward the observed workloads live
  in a k3d cluster on a cloud VM reached over Tailscale; the observability plane and
  agents stay local. Network and cluster state are frequently in flux by design.
- **The lab is often down.** The workstation has 16 GB of RAM and the VM gets
  snapshotted and deleted to pause billing. Seeing this app with nothing behind it
  is a normal, expected state — not an error condition.
- **BFF architecture.** Pages call server functions in `src/server/functions.ts`;
  the typed seam to agent-service is `src/server/agent-client.ts`, validated against
  `@obs/contracts`.
- **The app observes itself.** `src/lib/rum.ts` exports browser spans and web-vitals
  to Alloy, joining the gateway's trace tree.

## Capabilities and Constraints

Confirmed surfaces:

| Route                 | What it is                                                         |
| --------------------- | ------------------------------------------------------------------ |
| `/`                   | Golden signals from Mimir, recent incidents and agent runs         |
| `/telemetry`          | Embedded Grafana dashboards (kiosk mode, anonymous auth)           |
| `/lineage`            | Embedded Marquez UI                                                |
| `/agents`             | Streaming agent chat — SSE, live tool calls, inline artifacts      |
| `/agents/runs/:runId` | Run detail: message log, tool timeline, artifacts, approval gate   |
| `/incidents`          | Incident inbox and rendered postmortems                            |
| `/runbooks`           | Lists `runbooks/*.md`; starts a gated executor run                 |
| `/oncall`             | The autonomous on-call loop: incidents, pre-checks, approval cards |
| `/settings`           | Dev token/tenant, tenant registry, agent permission matrix         |

Constraints that bind future work:

- **Every surface must survive a dead lab.** Mimir, Loki, Tempo, Marquez,
  agent-service, and the remote cluster are each independently absent much of the
  time. Disconnected and empty states are the common case and must be truthful
  about _which_ dependency is missing — not a generic spinner or a blank panel.
- **Approval gates are load-bearing and cannot be softened.** A mutating agent
  action is dry-run first; only a server-verified diff makes an approval
  executable, and the approve/deny carries a nonce. No auto-advance, no
  optimistic UI, no design that makes denying harder than approving.
- **Real telemetry only.** Nothing in the UI may fabricate metrics, incidents,
  runs, or postmortems. `src/server/sample-incident.ts` is the single seeded
  fixture and must read as seeded wherever it surfaces.
- **Technical stack is fixed:** TanStack Start, React 19, Tailwind v4, and the
  shadcn component layer under `src/components/ui` (`components.json`, style
  `base-nova`, Lucide icons). Palette, typography, and visual language are open;
  the build and component substrate are not.
- **Two panels are not ours to style.** `/telemetry` and `/lineage` are iframes
  onto Grafana and Marquez. Their interiors are third-party; only the surrounding
  chrome is in scope.
- **Streaming is the norm, not an enhancement.** Agent output arrives as SSE
  `AgentStreamEvent` frames with per-segment narration flushes; layouts must hold
  up while content is still arriving and while tool calls resolve out of order.

## Brand Commitments

None are binding. The product name is "AI Observability Lab"; this workspace is
`@obs/web`, described in its README as "the control plane." The current look
(shadcn `base-nova`, Geist / Geist Mono, dark by default with a light toggle) is
incumbent implementation, deliberately recorded as evidence rather than as a
commitment — the operator has left visual language open.

## Evidence on Hand

- **Real, when the lab is up:** Mimir metrics, Loki logs, Tempo traces (including
  traces of the agent runs themselves and of CI pipelines), Marquez lineage,
  Postgres incident and run records, DORA delivery metrics.
- **Real content in-repo:** `runbooks/*.md`, agent-authored postmortems opened as
  Gitea PRs, provisioned Grafana dashboards, `infra/ports.env` as the address book.
- **Seeded:** `src/server/sample-incident.ts` — the only fixture.
- **Explicitly absent — must never be invented:** customers, testimonials, usage
  numbers, pricing, licensing, benchmarks, uptime claims, team members, or any
  third-party logo. This is a personal lab with a single operator. `docs/` holds
  local-only explainer pages and is gitignored, so it is not a source future work
  can link to.

## Product Principles

1. **The failing case is the design case.** Dependencies down, data absent, and
   partial streams are the states this app spends most of its life in. Design them
   first and name the missing dependency; the healthy dashboard is the easy path.
2. **An agent's reasoning is content, not chrome.** Narration, tool calls, and
   artifacts deserve the same layout care as a metric panel.
3. **Make the consequential decision the deliberate one.** Approving a mutation is
   the highest-stakes act in the product; it must be legible, reversible in intent,
   and never easier than reading what it does.
4. **Comprehension over expression.** The operator is mid-incident. Scanability,
   stable layout, and consistent status vocabulary outrank visual ambition — which
   lives in precision, not decoration.
5. **Don't restate what the embed already says.** Grafana and Marquez own their
   panels; this app's job is orientation, connective tissue, and everything those
   tools cannot show.

## Accessibility & Inclusion

No product-specific requirement established beyond ordinary web practice. The app
already ships a light/dark toggle. Status must never be carried by color alone —
`status-dot.tsx` and `run-status-badge.tsx` are shared across surfaces and are the
right place to keep that guarantee.
