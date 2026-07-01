# ADR-005 — Chaos, SLOs, and production-grade polish (Phase 6)

Status: accepted · Date: 2026-07-01 · Supersedes: none · Related: [ADR-002](./002-subject-system.md), [ADR-003](./003-application-observability.md), `docs/PLAN.html#p6`

This records the Phase 6 decisions: how synthetic incidents are produced on a
clock, how the lab expresses SLOs with multi-window burn-rate alerts, how the
collector enforces cardinality and tail-samples traces, how a Bun service is
profiled, how the browser reports RED, and how one script ties it together.

> Note on numbering: `docs/PLAN.html` refers to this as "phase 6". ADRs are not
> phase-numbered — the repo has ADR-001…004, so this is **ADR-005** (Phases 4–5
> did not each take an ADR).

---

## 1. Chaos via a runtime control plane (not env or restarts)

The Plan's chaos timeline (happy → latency spike → error burst → retriever
outage → baseline) must **genuinely move the SLIs** the alerts watch, on a
schedule, repeatably. The existing fault model (`apps/model-proxy`) is loaded
once from env at startup and is otherwise autonomous, so it cannot be modulated
on a clock without a restart.

**Decision.** Add a small **dev/lab-only control plane** to the two services that
own the relevant failure modes, and drive it from the load-generator:

- **model-proxy** `/admin/chaos` — merges a partial `FaultConfig` override
  (`p500` for error bursts, `latencyBaseMs`/`latencyGammaScaleMs` for latency
  spikes) over the env base **per request**. `decideFault` resolves the effective
  config each call, so an override takes effect immediately and is cleared just
  as fast.
- **retriever** `/admin/chaos` — toggles a simulated `outage` (every
  `/v1/retrieve` → 503) or a partial `errorRate` brownout. The gateway maps
  either to a **502**, exercising availability.

Both are gated behind `CHAOS_CONTROL_ENABLED` (default on; set `false` to drop
the routes entirely) and are only reachable inside the compose network / on
published localhost ports. State is module-level (survives across requests in one
process) and always reset by the scheduler's `finally`.

**Scheduler.** `apps/load-generator` gains `bun run chaos`: it reads a YAML
timeline (`chaos/full.yaml`, the 26-minute Plan cycle; `chaos/demo.yaml`, a
compressed ~6-minute cycle for the demo), drives baseline traffic for the whole
duration, and applies/clears each phase against the targets' control planes on a
clock. The pure pieces — schedule parse/validate and the apply/clear timeline —
are unit-tested; the orchestration is a thin `setTimeout` shell.

**Why a subject-service control plane rather than eBPF/tc network chaos:** it is
deterministic, in-process, needs no privileges, and maps one-to-one onto the
failure modes the SLOs care about. The cost is a small amount of clearly-fenced,
non-production code in two services.

## 2. SLOs, recording rules, and multi-window burn-rate alerts

Three SLOs live as source-of-truth specs in `slo/*.yaml` (objective, 28-day
window, `good`/`total` SLI PromQL, burn-rate params with the maths written out):

| SLO                  | Objective | SLI                               |
| -------------------- | --------- | --------------------------------- |
| gateway-availability | 99.5%     | non-5xx `/v1/chat`                |
| gateway-latency      | 95%       | `/v1/chat` under 1.5s             |
| rag-quality          | 90%       | retrievals with top-1 score ≥ 0.6 |

Two small telemetry additions make the SLIs **exact**: a `1.5` boundary on the
request-duration histogram (`@obs/telemetry`), and a new `retrieval_top_score`
histogram (with a `0.6` boundary) recording the best score per request — the
existing histogram records every chunk, not the top-1. **Choose histogram
boundaries to match your SLO thresholds.**

The specs are compiled by hand into Mimir recording rules
(`infra/mimir/rules/anonymous/` — the ruler's tenant dir when multitenancy is
off): per SLO, the error ratio over each burn-rate window (5m/1h/30m/6h), an
instantaneous SLI, and rolling 28-day compliance. Numerators are counts and
denominators are `clamp_min(…, 1)`, so an idle window reads 0 error rather than a
divide-by-zero.

**Burn-rate alerts** (Grafana `slo-burn` group) implement the Google SRE
multi-window pattern: a **fast-burn** page (2% of the budget in 1h; 5m **and** 1h
windows) and a **slow-burn** ticket (10% in 6h; 30m **and** 6h). The "both
windows over threshold" AND is encoded directly in PromQL as
`(short > bool T) * (long > bool T)`, so the alert stays a single-query rule with
a `> 0` threshold — identical in shape to the Phase 2 alerts. They carry
`severity` (page → sev1 / warning → sev2) and `tenant=acme`, so the existing
`agent-webhook` routes them straight to the **incident reporter**.

**Deliberate honesty about loose SLOs.** For a 90% objective the budget is 10%,
so `burn_rate_threshold * budget` exceeds an error ratio of 1.0 — a fast burn is
mathematically impossible. Multi-window burn-rate alerting is built for _tight_
SLOs; rag-quality therefore alerts directly on the SLI dropping below the
objective, and this is documented rather than papered over.

## 3. Cardinality control and tail-based sampling (collector layer)

Both are enforced in Alloy so services stay unaware of them.

- **Cardinality.** `otelcol.processor.attributes.scrub` **deletes**
  `user_id`/`request_id`/`session_id` from metric datapoints before Mimir
  (storage ≈ distinct label combinations; dropping cuts it, hashing only
  pseudonymises). Traces and logs keep these — they need per-request context. A
  `max_global_series_per_user` backstop in Mimir plus an Alloy scrape of Mimir's
  own `/metrics` lets a `mimir-cardinality` alert fire on
  `cortex_discarded_samples_total` when the limit is crossed.
- **Tail sampling.** `otelcol.processor.tail_sampling` keeps every **ERROR**
  trace and every trace **≥ 1.5s**, and 10% of the rest (`decision_wait 10s`).
  This sharply cuts Tempo storage while preserving exactly the traces reached for
  during an incident.

**Known interaction (documented, not hidden):** Tempo's metrics-generator makes
its span metrics from the spans it _receives_, i.e. after Alloy's tail sampling —
so span-metric counts are sampled, and the non-uniform policy biases them toward
slow/error. The lab's **primary** RED (rate/errors) and both gateway SLOs read
the services' own `request_duration_seconds` (metrics pipeline, unsampled), so
they stay accurate; span metrics are used only where a sampled view is
acceptable. Browser RED (§5) is emitted as real metrics for the same reason.

## 4. Profiling a Bun service: eBPF, not the Node SDK

The subject services run on **Bun**, which uses JavaScriptCore, not V8.
Pyroscope's Node integration (`@pyroscope/nodejs`) relies on the V8 CPU profiler,
so it **cannot** profile a Bun process. The language-agnostic answer is **eBPF**:
a dedicated Alloy profiler (`infra/alloy/profiler.alloy`) discovers the subject
containers and ships `process_cpu` profiles to Pyroscope. Grafana provisions the
Pyroscope datasource and a `tracesToProfiles` link so a slow span jumps to its
service's flame graph; a "Gateway · Profiles" dashboard shows it directly.

Because eBPF needs a Linux host / Docker Desktop with BTF, privileged, and
`pid: host`, the profiler is **opt-in** behind the compose `profiling` profile —
it can never affect the default `obs up` stack. The Pyroscope _server_ is always
up so the datasource and dashboard resolve.

## 5. Browser RUM as real metrics

The web app already traced fetches. Phase 6 adds a browser **MeterProvider**
(`apps/web/src/lib/rum.ts`) exporting OTLP metrics to Alloy:
`browser_http_requests_total` (a real request counter, tagged
`service`/`status_class`/`is_error` from the fetch-instrumentation hook) and Web
Vitals histograms `browser_lcp_ms`/`browser_inp_ms` (via `web-vitals`). These are
real counters/histograms, so — unlike span-derived metrics — they are **not**
undercounted by tail sampling. A "Frontend (browser RUM)" row on the gateway
dashboard shows browser requests/sec, error rate, and LCP p75. `service="web"` is
an explicit datapoint attribute so it becomes a Mimir label.

## 6. The synthetic incident demo

`scripts/demo-incident.sh` (`bun run demo:incident`) is the keystone: preflight
the stack (it brings compose up if needed; the host-run agent-service on :8090 is
required and cannot be auto-started — it needs the local Claude session), inject
the compressed chaos error burst, poll the `incidents` table until the reporter
files a postmortem, print the inbox entry + postmortem, then ask the RCA
assistant a scripted follow-up and stream its grounded answer. It runs ~6–8
minutes because the fast alert needs a sustained burst; chaos is cleared on exit.

## 7. What was deliberately left out

- **No Alertmanager.** The Mimir ruler only _records_; alerting lives in Grafana
  so it can reuse the Phase-5 `agent-webhook`. No second alerting system.
- **No span-metrics rearchitecture.** Generating span metrics from the full
  pre-sampling stream (an Alloy `spanmetrics` connector) would keep sampled RED
  accurate, but it duplicates Tempo's generator and risks the existing
  dashboards. The accurate RED already comes from the services' own metrics.
- **Profiling is opt-in and host-dependent** — see §4. This is the one Phase-6
  piece whose runtime behaviour depends on the host kernel.
