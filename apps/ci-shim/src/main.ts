// ci-shim - Gitea pipelines as telemetry (PLAN-2 P9).
//
// Consumes Gitea's GitHub-style workflow_run / workflow_job webhooks:
//   workflow_job  -> queue-time + pending-job bookkeeping (the stall signal)
//   workflow_run(completed) -> ONE post-hoc OTLP trace batch (per-job,
//     per-step spans with real timestamps), DORA counters/histograms, and -
//     when main deployed - Grafana deploy annotations per service.
//
// Metrics are exposed at /metrics (Prometheus text) and scraped by the
// laptop's Alloy over the tailnet; see src/metrics.ts for why scrape > push
// for sparse CI events.
import { Hono } from "hono";
import { buildTrace, type JobInfo, postDeployAnnotations, postTrace, type RunInfo } from "./emit";
import { CallbackGauge, Counter, Histogram, Registry } from "./metrics";

const port = Number(process.env.CI_SHIM_PORT ?? "8095");
const otlpUrl = process.env.OTLP_URL ?? "http://localhost:4318";
const grafanaUrl = process.env.GRAFANA_URL ?? "http://localhost:3001";
const giteaUrl = process.env.GITEA_URL ?? "http://gitea:3000";
const giteaToken = process.env.GITEA_TOKEN ?? "";
const startedAt = Date.now();

// Gitea 1.26's workflow_run payload ships head_commit: null, so the DORA
// lead-time clock (commit -> deploy) needs one API round-trip per deploy.
async function fetchCommitTimestamp(repoFullName: string, sha: string): Promise<string | null> {
  if (!giteaToken) return null;
  try {
    const res = await fetch(`${giteaUrl}/api/v1/repos/${repoFullName}/git/commits/${sha}`, {
      headers: { Authorization: `token ${giteaToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { commit?: { committer?: { date?: string } } };
    return json.commit?.committer?.date ?? null;
  } catch {
    return null;
  }
}

// What a main-branch deploy ships (mirrors the loop in .gitea/workflows/ci.yaml).
const DEPLOYED_SERVICES = ["gateway", "embedder", "retriever", "model-proxy", "load-generator"];

// --- metrics -----------------------------------------------------------------
const registry = new Registry();
const runsTotal = registry.register(
  new Counter("cicd_pipeline_runs_total", "Completed pipeline runs by workflow/branch/result"),
);
const runDuration = registry.register(
  new Histogram(
    "cicd_pipeline_run_duration_seconds",
    "Wall-clock duration of completed pipeline runs",
    [30, 60, 120, 240, 480, 900, 1800],
  ),
);
const queueSeconds = registry.register(
  new Histogram(
    "cicd_pipeline_queue_seconds",
    "Per-job time from queued to picked up by a runner",
    [1, 5, 15, 30, 60, 120, 300, 600],
  ),
);
const deploymentsTotal = registry.register(
  new Counter("cicd_deployments_total", "Successful deploys to the cluster, per service"),
);
const leadTime = registry.register(
  new Histogram(
    "cicd_lead_time_seconds",
    "Commit timestamp to completed deploy (DORA lead time)",
    [60, 300, 900, 1800, 3600, 14400, 86400],
  ),
);
const webhookErrors = registry.register(
  new Counter("cicd_shim_errors_total", "Emission failures by stage (trace/annotation/parse)"),
);

// Pending jobs: the queue-stall alert's raw signal. A dead runner means jobs
// queue forever and never reach in_progress - only a live gauge can see that
// (completed-run metrics never arrive).
const pendingJobs = new Map<number, number>(); // job id -> queued-at ms
registry.register(
  new CallbackGauge("cicd_pipeline_pending_jobs", "Jobs currently queued/waiting", () => {
    return pendingJobs.size;
  }),
);
registry.register(
  new CallbackGauge(
    "cicd_pipeline_oldest_pending_seconds",
    "Age of the oldest queued job (0 when none pending)",
    () => {
      if (pendingJobs.size === 0) return 0;
      return Math.round((Date.now() - Math.min(...pendingJobs.values())) / 1000);
    },
  ),
);

// --- webhook state -----------------------------------------------------------
// workflow_job payloads per run, so the run-completed handler has per-job
// (and per-step) timings without an API round-trip. In-memory on purpose:
// a shim restart loses at most the runs in flight during it.
const runJobs = new Map<number, Map<number, JobInfo>>();

function asJob(wj: Record<string, unknown>): JobInfo {
  const steps = Array.isArray(wj.steps) ? (wj.steps as Record<string, unknown>[]) : [];
  return {
    id: Number(wj.id),
    name: String(wj.name ?? "job"),
    conclusion: String(wj.conclusion ?? "unknown"),
    createdAt: (wj.created_at as string) ?? null,
    startedAt: (wj.started_at as string) ?? null,
    completedAt: (wj.completed_at as string) ?? null,
    htmlUrl: String(wj.html_url ?? ""),
    steps: steps.map((s, i) => ({
      name: String(s.name ?? `step ${i}`),
      number: Number(s.number ?? i),
      conclusion: String(s.conclusion ?? "unknown"),
      startedAt: (s.started_at as string) ?? null,
      completedAt: (s.completed_at as string) ?? null,
    })),
  };
}

function handleWorkflowJob(action: string, body: Record<string, unknown>): void {
  const wj = body.workflow_job as Record<string, unknown> | undefined;
  if (!wj) return;
  const jobId = Number(wj.id);
  const runId = Number(wj.run_id);

  if (action === "queued" || action === "waiting") {
    if (!pendingJobs.has(jobId)) pendingJobs.set(jobId, Date.parse(String(wj.created_at)));
    return;
  }
  pendingJobs.delete(jobId);

  if (action === "completed") {
    const job = asJob(wj);
    if (!runJobs.has(runId)) runJobs.set(runId, new Map());
    runJobs.get(runId)?.set(jobId, job);
    if (job.createdAt && job.startedAt && job.conclusion !== "skipped") {
      const q = (Date.parse(job.startedAt) - Date.parse(job.createdAt)) / 1000;
      if (q >= 0) queueSeconds.observe({ job: job.name }, q);
    }
  }
}

async function handleWorkflowRun(action: string, body: Record<string, unknown>): Promise<void> {
  if (action !== "completed") return;
  const wr = body.workflow_run as Record<string, unknown> | undefined;
  const workflow = body.workflow as Record<string, unknown> | undefined;
  const repository = body.repository as Record<string, unknown> | undefined;
  if (!wr) return;

  const headCommit = wr.head_commit as Record<string, unknown> | undefined;
  const run: RunInfo = {
    id: Number(wr.id),
    runNumber: Number(wr.run_number ?? 0),
    workflowName: String(workflow?.name ?? wr.name ?? "ci"),
    branch: String(wr.head_branch ?? ""),
    sha: String(wr.head_sha ?? ""),
    event: String(wr.event ?? "push"),
    conclusion: String(wr.conclusion ?? "unknown"),
    htmlUrl: String(wr.html_url ?? ""),
    repoUrl: String(repository?.html_url ?? ""),
    commitTimestamp: (headCommit?.timestamp as string) ?? null,
    startedAt: String(wr.run_started_at ?? wr.started_at ?? wr.created_at),
    completedAt: String(wr.updated_at ?? new Date().toISOString()),
  };
  const jobs = [...(runJobs.get(run.id)?.values() ?? [])].sort((a, b) => a.id - b.id);
  runJobs.delete(run.id);

  const durationS = (Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000;
  runsTotal.inc({ workflow: run.workflowName, branch: run.branch, result: run.conclusion });
  if (durationS >= 0) {
    runDuration.observe({ workflow: run.workflowName, result: run.conclusion }, durationS);
  }

  try {
    await postTrace(otlpUrl, buildTrace(run, jobs));
    console.log(
      `[ci-shim] trace emitted: run ${run.id} (${run.conclusion}) ${jobs.length} jobs, ${durationS}s`,
    );
  } catch (err) {
    webhookErrors.inc({ stage: "trace" });
    console.error(`[ci-shim] trace emission failed for run ${run.id}:`, err);
  }

  // A deployment = the deploy job actually succeeded (main-only by workflow
  // design). Everything DORA hangs off this moment.
  const deployed = jobs.some((j) => j.name === "deploy" && j.conclusion === "success");
  if (deployed) {
    for (const svc of DEPLOYED_SERVICES) {
      deploymentsTotal.inc({ service: svc, result: "success" });
    }
    const commitTs =
      run.commitTimestamp ??
      (await fetchCommitTimestamp(String((body.repository as any)?.full_name ?? ""), run.sha));
    if (commitTs) {
      const lead = (Date.parse(run.completedAt) - Date.parse(commitTs)) / 1000;
      if (lead >= 0) leadTime.observe({}, lead);
    }
    try {
      await postDeployAnnotations(grafanaUrl, DEPLOYED_SERVICES, run);
      console.log(`[ci-shim] deploy annotations posted for :${run.sha.slice(0, 7)}`);
    } catch (err) {
      webhookErrors.inc({ stage: "annotation" });
      console.error(`[ci-shim] annotation post failed for run ${run.id}:`, err);
    }
  }
}

// --- http --------------------------------------------------------------------
const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "ci-shim", uptimeMs: Date.now() - startedAt }),
);

app.get("/metrics", (c) => c.text(registry.render()));

app.post("/webhook", async (c) => {
  const event = c.req.header("x-gitea-event") ?? c.req.header("x-github-event") ?? "unknown";
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    webhookErrors.inc({ stage: "parse" });
    return c.json({ error: "bad payload" }, 400);
  }
  const action = String(body.action ?? "");
  console.log(`[ci-shim] webhook event=${event} action=${action}`);
  if (event === "workflow_job") handleWorkflowJob(action, body);
  else if (event === "workflow_run") await handleWorkflowRun(action, body);
  return c.json({ accepted: true }, 202);
});

console.log(`[ci-shim] listening on :${port} (otlp=${otlpUrl}, grafana=${grafanaUrl})`);

export default { port, fetch: app.fetch };
