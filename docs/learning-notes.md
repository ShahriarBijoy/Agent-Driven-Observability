# Learning notes

The keeper artifact from building the AI Observability Lab: for each phase, the
three things I'd tell a colleague who has never built observability before. Not a
tutorial — the ideas that actually changed how I think.

---

## Phase 0 — Foundation

1. **Config is not secrets, and a monorepo makes you prove it.** The moment you
   have five services sharing one repo, "where does this value live" stops being
   rhetorical. A shared `tsconfig` package and one lint/format toolchain
   (Oxlint/Oxfmt here) pay for themselves the first time you change a rule once
   instead of five times.
2. **A task graph matters even locally.** Turborepo isn't just for CI — running
   `dev`/`typecheck`/`test` through a task graph means you stop guessing what
   depends on what, and caching turns "rebuild everything" into "rebuild the one
   thing that changed."
3. **Set the skeleton before the flesh.** Compose files, networks, and empty
   service folders up front means every later phase drops into a known shape.
   The cost of an empty `slo/` folder with a README is nearly zero; the cost of
   inventing structure mid-incident is high.

## Phase 1 — The subject system

1. **You can't learn observability without something worth observing.** A CRUD
   toy teaches nothing. A small AI gateway with a real RAG pipeline (embed →
   retrieve → generate), auth, rate limiting, and a **deliberate fault model**
   gives every later signal something true to say.
2. **Build the faults in from day one.** The model-proxy's gamma-distributed
   latency, probabilistic 500s/429s, and "bad minute" clustering aren't
   decoration — they are the reason the dashboards and alerts have anything to
   show. Realistic breakage is a feature.
3. **Vertical slices make telemetry natural.** When a feature owns its domain,
   ports, adapters, handlers, _and_ its spans/metrics, instrumenting it means
   instrumenting the whole slice — not bolting a logging layer on afterward.

## Phase 2 — Application observability

1. **Instrument to a standard, not a backend.** Everything speaks OpenTelemetry
   over OTLP to one collector (Alloy), which fans out to Loki/Tempo/Mimir. Swap a
   backend later and you re-configure the collector, not re-instrument the code.
2. **The three pillars are only useful at their seams.** Logs, metrics, and
   traces in isolation are three haystacks. The value is the join: an **exemplar**
   staples a `trace_id` to a latency data point so "the p99 is high" becomes
   "this exact request," and a `trace_id` on every log line closes the loop.
3. **Labels are a budget, not a bag.** Loki indexes labels, not content; Mimir's
   cost tracks distinct label combinations. Good labeling discipline (low
   cardinality, meaningful dimensions) is the difference between a system you can
   afford and one you can't.

## Phase 3 — Data observability

1. **A RAG pipeline is a data pipeline — model it as one.** Every `/v1/chat` is
   an OpenLineage _run_ with input/output datasets and sub-runs. Lineage answers
   "where did this come from and what does it feed" — a question metrics and
   traces can't.
2. **Data quality is a first-class SLI.** Freshness, volume, distribution drift
   (Kolmogorov–Smirnov), schema, and cache health are checks you run on a
   schedule and emit as metrics — the same shape as latency or errors. Bad data
   is an outage even when every service is green.
3. **Drift is the quiet failure.** Nothing 500s when your prompt distribution
   shifts; the system just gets subtly worse. You only see it if you measure the
   _shape_ of the data, not just its presence.

## Phase 4 — The control plane

1. **A UI is where correlation becomes muscle memory.** Embedding Grafana and
   Marquez behind one time-range control, next to the incident inbox, means the
   drill-down path (signal → trace → log → lineage) is one surface, not five tabs.
2. **RUM closes the trace tree at the click.** Instrument the browser with the
   OTel web SDK and propagate `traceparent`, and a frontend fetch span _parents_
   the gateway's server span — one trace from click to database. The user's
   latency and yours are the same trace.
3. **Keep a wire contract between UI and backend.** Streaming runs, tool calls,
   and approvals over SSE against a shared schema (`@obs/contracts`) meant the
   Phase-5 agent-service could replace a placeholder behind the exact same seam.

## Phase 5 — The intelligence plane

1. **Give the model tools, not prose.** The agents don't reason about pasted
   logs; they call `loki_query`/`tempo_query`/`mimir_query`/`pg_select` and
   ground every claim in a real result. One shared 10-tool kit; only the system
   prompt and allow-list differ per agent.
2. **Human-in-the-loop is a design primitive.** Mutating agents (runbook
   executor, auto-fixer) block on an explicit approval gate before they act. The
   auto-fixer works in a _contained clone_, not your repo. Autonomy and safety
   are dials, not a switch.
3. **Agents are just another instrumented service.** Each run is one
   `agent.<kind>` trace with a `tool.<name>` child span per call, audited to
   Postgres. The thing that reads your telemetry produces telemetry you can read.

## Phase 6 — Chaos, SLOs, and polish

1. **You don't understand an alert until you've made it fire on purpose.** A
   clock-driven chaos scheduler that produces a real error burst (and silences
   when it recovers) is worth more than any amount of alert-rule review. If you
   can't reproduce the incident, you can't trust the alert.
2. **SLOs turn "is it up?" into "how much budget is left?"** An error budget and
   **multi-window burn-rate** alerts (fast + slow, each requiring a short _and_ a
   long window) catch you spending reliability too fast without paging on every
   blip. But the maths only works for tight objectives — a loose 90% SLO can't
   fast-burn, and pretending otherwise ships a dead alert. Know when the pattern
   doesn't apply.
3. **Push cost control into the collector, and know what it costs you.** Dropping
   unbounded labels and tail-sampling traces (keep every error/slow trace, 10% of
   the rest) slash storage — but sampling _after_ span-metrics generation biases
   those metrics, so accurate RED must come from real counters. Match histogram
   boundaries to SLO thresholds. Every efficiency choice has a measurement
   consequence; write it down.

---

_Built end to end on free, self-hosted tooling — Bun/Hono services, the Grafana
LGTM stack, OpenLineage/Marquez, and the Claude Agent SDK. The whole point was to
break a realistic system on purpose and have it explain itself back._
