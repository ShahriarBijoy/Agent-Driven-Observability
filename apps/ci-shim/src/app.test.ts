import { describe, expect, it } from "vitest";
import { buildTrace, type JobInfo, type RunInfo } from "./emit";
import { CallbackGauge, Counter, Histogram, Registry } from "./metrics";

const run: RunInfo = {
  id: 4,
  runNumber: 4,
  workflowName: "ci",
  branch: "main",
  sha: "a243b420c602bf3d89048f10ab53b8859d00e2bd",
  event: "push",
  conclusion: "success",
  htmlUrl: "http://obs-vm:3005/obs/obs-lab/actions/runs/4",
  repoUrl: "http://obs-vm:3005/obs/obs-lab",
  commitTimestamp: "2026-07-20T19:00:00Z",
  startedAt: "2026-07-20T19:07:54Z",
  completedAt: "2026-07-20T19:09:00Z",
};

const jobs: JobInfo[] = [
  {
    id: 10,
    name: "test",
    conclusion: "success",
    createdAt: "2026-07-20T19:07:50Z",
    startedAt: "2026-07-20T19:07:54Z",
    completedAt: "2026-07-20T19:08:30Z",
    htmlUrl: "http://obs-vm:3005/obs/obs-lab/actions/runs/4/jobs/0",
    steps: [
      {
        name: "install",
        number: 1,
        conclusion: "success",
        startedAt: "2026-07-20T19:07:55Z",
        completedAt: "2026-07-20T19:08:10Z",
      },
      // Skipped steps arrive with epoch-0 timestamps - must not become spans.
      {
        name: "never-ran",
        number: 2,
        conclusion: "skipped",
        startedAt: "1970-01-01T00:00:00Z",
        completedAt: "1970-01-01T00:00:00Z",
      },
    ],
  },
];

describe("buildTrace", () => {
  it("builds root + job + real-step spans in one trace", () => {
    const trace = buildTrace(run, jobs);
    const spans = trace.resourceSpans[0]?.scopeSpans[0]?.spans ?? [];
    expect(spans.map((s) => s.name)).toEqual(["ci: ci #4", "test", "test: install"]);
    const traceIds = new Set(spans.map((s) => s.traceId));
    expect(traceIds.size).toBe(1);
    // Job's parent is the root; the step's parent is the job.
    const [root, job, step] = spans as Array<Record<string, unknown>>;
    expect(job?.parentSpanId).toBe(root?.spanId);
    expect(step?.parentSpanId).toBe(job?.spanId);
  });

  it("carries the CI/CD semconv identity + result attributes", () => {
    const trace = buildTrace(run, jobs);
    const root = trace.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    const attrs = Object.fromEntries(
      (root?.attributes ?? []).map((a) => [a.key, Object.values(a.value)[0]]),
    );
    expect(attrs["cicd.pipeline.name"]).toBe("ci");
    expect(attrs["cicd.pipeline.result"]).toBe("success");
    expect(attrs["vcs.ref.head.revision"]).toBe(run.sha);
    const resAttrs = Object.fromEntries(
      (trace.resourceSpans[0]?.resource.attributes ?? []).map((a) => [
        a.key,
        Object.values(a.value)[0],
      ]),
    );
    expect(resAttrs["service.name"]).toBe("cicd");
  });

  it("marks failed runs with error status", () => {
    const failed = buildTrace({ ...run, conclusion: "failure" }, []);
    expect(failed.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.status).toEqual({
      code: 2,
      message: "failure",
    });
  });
});

describe("metrics registry", () => {
  it("renders counters, histograms, and gauges in Prometheus text format", () => {
    const reg = new Registry();
    const c = reg.register(new Counter("cicd_deployments_total", "deploys"));
    const h = reg.register(new Histogram("cicd_queue_seconds", "queue", [1, 10]));
    reg.register(new CallbackGauge("cicd_pending", "pending", () => 3));
    c.inc({ service: "gateway", result: "success" });
    c.inc({ service: "gateway", result: "success" });
    h.observe({}, 5);
    const text = reg.render();
    expect(text).toContain('cicd_deployments_total{result="success",service="gateway"} 2');
    expect(text).toContain('cicd_queue_seconds_bucket{le="1"} 0');
    expect(text).toContain('cicd_queue_seconds_bucket{le="10"} 1');
    expect(text).toContain('cicd_queue_seconds_bucket{le="+Inf"} 1');
    expect(text).toContain("cicd_queue_seconds_sum 5");
    expect(text).toContain("cicd_pending 3");
  });
});
