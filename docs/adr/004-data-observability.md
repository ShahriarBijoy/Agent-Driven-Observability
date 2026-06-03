# ADR-004 — Data observability (Phase 3)

Status: accepted · Date: 2026-06-04 · Supersedes: none · Related: [ADR-002](./002-subject-system.md), [ADR-003](./003-application-observability.md), `docs/PLAN.html#p3`

This document records the Phase 3 decisions: how the RAG pipeline is modelled as a
data pipeline with **OpenLineage**, and how scheduled **data-quality** checks turn
freshness, volume, drift, schema and cache health into first-class SLIs alongside
the Phase 2 app SLIs.

> Note on numbering: `docs/PLAN.html#p3` calls its lineage ADR "ADR-002". The repo
> already has ADR-001…003, so this is **ADR-004**. The plan's number was written
> before Phases 1–2 each took an ADR.

---

## 1. Lineage taxonomy

Every `/v1/chat` call is one **run** of the job `rag.inference`. The embedder and
retriever emit **sub-runs** linked to it.

| Entity             | OpenLineage name                            | Notes                                  |
| ------------------ | ------------------------------------------- | -------------------------------------- |
| Job (parent)       | `rag.inference`                             | gateway, one run per chat              |
| Job (child)        | `rag.embed`                                 | embedder                               |
| Job (child)        | `rag.retrieve`                              | retriever                              |
| Input dataset      | `vector_store.chunks`                       | the pgvector corpus                    |
| Input dataset      | `cache.embeddings`                          | the Redis embedding cache              |
| Output dataset     | `prompts.recent`                            | materialised in the `inferences` table |
| Output dataset     | `completions.recent`                        | materialised in the `inferences` table |
| Dataset (embed)    | `prompts.incoming` → `cache.embeddings`     | embedder in/out                        |
| Dataset (retrieve) | `vector_store.chunks` → `retrieval.results` | retriever in/out                       |

**Namespace.** All jobs and datasets use the namespace `ai-observability-lab`.
OpenLineage convention would put each dataset in its datasource namespace
(`postgres://…`, `redis://…`); for a learning lab a single logical namespace keeps
the Marquez graph readable. This is a deliberate simplification.

**Facets.**

- `parent` (ParentRunFacet, `1-1-0`) — links each sub-run to the gateway's run.
- `retrievalStats` — a **custom** run facet on the inference COMPLETE event:
  `{count, min, max, mean}` of retrieval relevance scores.
- `inference` — a custom run facet carrying `{model, tenant}`.
- `errorMessage` (ErrorMessageRunFacet) — on FAIL events.

**Spec versions** (verified against the live OpenLineage spec, pinned in
`packages/lineage/src/spec.ts`): RunEvent `2-0-2` (`#/$defs/RunEvent`,
JSON-Schema draft 2020-12), ParentRunFacet `1-1-0`. `runId` is a UUID. Events POST
as raw JSON to Marquez `POST /api/v1/lineage` (→ `201 Created`).

## 2. Emission mechanics (`@obs/lineage`)

- The package exposes pure RunEvent builders (`startEvent`/`completeEvent`/
  `failEvent`), a `LineageEmitter` that POSTs to Marquez, the dataset/job
  constants, facet builders, and `withChildRun` for the sub-run pattern. All are
  unit-tested.
- **Best-effort.** Emission never blocks or fails a request: a Marquez outage is
  swallowed and logged. Lineage auto-enables when `MARQUEZ_URL` is set (it is only
  set when `compose.lineage.yml` is composed in), and can be forced with
  `LINEAGE_ENABLED`.
- **Parent propagation.** The gateway binds its run as the parent for the duration
  of the embed + retrieve calls using an `AsyncLocalStorage` context; the upstream
  client stamps `x-ol-parent-run-id` / `-job-namespace` / `-job-name` headers; the
  embedder/retriever reconstruct the parent and link their sub-runs. The
  model-proxy call runs **outside** that context, so it is not a sub-run.

## 3. The `inferences` table

The DQ checks need per-inference signals that `usage_events` does not carry
(prompt length, retrieval score, cache flag, the response body). The gateway
therefore writes one row per **successful** chat to a new `inferences` table
(`run_id, tenant, model, prompt_chars, prompt_tokens, completion_tokens,
retrieved_count, retrieval_score_mean/max, cache_hit, status, response jsonb,
created_at`). This table **is** the materialisation of the `prompts.recent` /
`completions.recent` datasets.

Only successful inferences are recorded (`status = 'ok'`). Failures are already
captured by Phase 2 app telemetry (RED metrics, traces) and by lineage FAIL
events; keeping `inferences` to successful runs keeps the DQ queries simple. A
drop in successful volume is itself the signal the volume check fires on.

Writes are best-effort. The table is provisioned by `infra/postgres/init/02-*.sql`
for a fresh DB and **ensured at startup by the dq-runner** (CREATE … IF NOT
EXISTS) so an existing volume gets it without a wipe.

## 4. Data-quality checks

The dq-runner runs every `DQ_CHECK_INTERVAL_SECONDS` (default 30s):

| Check            | Logic                                                                                        | Default thresholds                   |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Freshness**    | seconds since last inference per tenant + last `chunks` update                               | stale > 120s (medium)                |
| **Volume**       | 1-min rate ÷ 1-hour baseline rate, per tenant                                                | ratio < 0.3 (high) or > 3.0 (medium) |
| **Distribution** | KS distance of prompt_chars / retrieval_score / completion_tokens, current 5m vs 1h baseline | KS > 0.25 (medium), > 0.4 (high)     |
| **Schema**       | validate last 100 responses against the ChatResponse contract                                | any failure (high)                   |
| **Cache health** | hit ratio per tenant over 5m                                                                 | ratio < 0.05 with ≥20 samples (low)  |

**Drift = KS statistic.** `scipy.stats.ks_2samp(...).statistic` is the sup-gap
between two empirical CDFs, already bounded in `[0,1]`, so it doubles as a
normalised drift score (0 identical, 1 disjoint). Drift is the most subjective
check — thresholds are env-tunable.

**Schema check** uses a pydantic mirror of `packages/contracts` `ChatResponse`
(Python cannot run Zod). Because the gateway emits well-typed responses, schema
failures are rare by construction; the check guards against contract drift and
degraded (e.g. empty-completion) responses.

## 5. dq-runner architecture

Python, **uv**-managed, FastAPI + APScheduler (`/health`, `/run`, `/violations`).
Each pass reads `inferences`, updates a thread-safe snapshot, and records
violations. Sections are independently guarded so one failing check never aborts
the pass.

**Metrics over OTLP.** dq\_\* metrics are pushed via OTLP/HTTP to Alloy → Mimir, so
data quality lands in the same backend as the app SLIs ("data quality as
first-class SLIs"). This adds `opentelemetry-sdk` + the OTLP HTTP exporter to the
dq-runner — **beyond** the plan's minimal dependency list, justified by the
dashboard requirement. Gauges are OTel **observable gauges** whose callbacks read
the latest snapshot; violations/pass-counts are counters.

Metric names: `dq_freshness_seconds{dataset,tenant}`, `dq_volume_count{tenant}`,
`dq_volume_ratio{tenant}`, `dq_distribution_drift{signal}`,
`dq_cache_hit_ratio{tenant}`, `dq_schema_failures`, `dq_schema_sampled`,
`dq_cache_keys`, `dq_violations_total{check,severity}`, `dq_check_runs_total`.

**`dq_violations` table.** `(id, check_name, signal, severity, dataset, ts,
payload jsonb)`. The plan names the first column `check`; that is a reserved word
in Postgres, so it is `check_name` here. Severity is `low` / `medium` / `high`.

## 6. Dashboard + alerts

- **Data Quality** Grafana dashboard (`uid: data-quality`): freshness per dataset,
  volume ratio (banded 0.3–3.0), drift per signal (banded 0.25/0.4), cache hit
  ratio, violation rate by check/severity, schema failures, and a **link-out** to
  the Marquez UI (`http://localhost:3002`) — a link, not an iframe, per the plan.
  Drift is shown as a per-signal timeseries rather than a heatmap (clearer for 3
  signals).
- **Two alerts** in the `data-quality` group: any high-severity violation in the
  last 5m, and prompt-length drift (KS) > 0.4 sustained 10m. Both carry
  `severity: page`, routing to the same contact point as the Phase 2 alerts.

## 7. Marquez deployment

`infra/compose.lineage.yml` adds `marquez-api` + `marquez-web` (both
`marquezproject/marquez*:0.50.0`) and a dedicated `marquez-db` (`postgres:14`,
Flyway-migrated by the API entrypoint). API on `:5000` (admin `:5001`), UI on
`:3002`. `marquez-api` joins the `app` network so the TS services can reach it;
`marquez-db`/`marquez-web` stay on an internal `lineage` network. The dq-runner
joins `app` (Postgres/Redis) + `obs` (Alloy). Composing this file also injects
`MARQUEZ_URL` into the TS services, which is the lineage on/off switch.

## 8. Acceptance (runtime)

With the full stack up and the load-generator running:

1. Marquez UI shows the `rag.inference` job with input/output dataset edges and
   the `rag.embed` / `rag.retrieve` sub-runs, populating live.
2. The Data Quality dashboard shows live values for all four check families.
3. A synthetic anomaly (e.g. the load-generator's `broken` scenario, or the
   model-proxy's bad-minute clustering, which collapses successful volume) creates
   a `dq_violations` row within ~30s.
4. The drift KS metric moves when the load-generator switches scenarios (e.g. the
   `long` scenario shifts the prompt-length distribution).
