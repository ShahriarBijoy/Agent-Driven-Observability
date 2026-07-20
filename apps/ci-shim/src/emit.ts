// Post-hoc OTLP emission: one COMPLETE pipeline trace per finished run,
// pushed to the laptop Alloy in a single batch.
//
// Why post-hoc: Alloy's tail sampler holds a trace for decision_wait=10s
// after the last span it saw. A live-emitting shim would send the root span
// minutes before the run ends - the sampler would decide early and every
// later job/step span would arrive orphaned. Emitting the whole trace at
// completion, with explicit timestamps, lands inside one decision window.
//
// Attribute names follow the OTel CI/CD semconv (cicd.pipeline.*, vcs.*).

export interface StepInfo {
  name: string;
  number: number;
  conclusion: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobInfo {
  id: number;
  name: string;
  conclusion: string;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string;
  steps: StepInfo[];
}

export interface RunInfo {
  id: number;
  runNumber: number;
  workflowName: string;
  branch: string;
  sha: string;
  event: string;
  conclusion: string;
  htmlUrl: string;
  repoUrl: string;
  commitTimestamp: string | null;
  startedAt: string;
  completedAt: string;
}

const hex = (bytes: number): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
};

const nanos = (iso: string): string => `${Date.parse(iso)}000000`;

type AttrValue = { stringValue: string } | { intValue: string };
const attr = (key: string, value: string | number): { key: string; value: AttrValue } => ({
  key,
  value: typeof value === "number" ? { intValue: String(value) } : { stringValue: value },
});

// OTLP enums: span kind SERVER=2, INTERNAL=1; status OK=1, ERROR=2.
const statusOf = (conclusion: string) =>
  conclusion === "success" || conclusion === "skipped"
    ? { code: 1 }
    : { code: 2, message: conclusion };

export function buildTrace(run: RunInfo, jobs: JobInfo[]) {
  const traceId = hex(16);
  const rootSpanId = hex(8);

  const rootSpan = {
    traceId,
    spanId: rootSpanId,
    name: `ci: ${run.workflowName} #${run.runNumber}`,
    kind: 2,
    startTimeUnixNano: nanos(run.startedAt),
    endTimeUnixNano: nanos(run.completedAt),
    attributes: [
      attr("cicd.pipeline.name", run.workflowName),
      attr("cicd.pipeline.run.id", run.id),
      attr("cicd.pipeline.run.url.full", run.htmlUrl),
      attr("cicd.pipeline.result", run.conclusion),
      attr("cicd.pipeline.trigger", run.event),
      attr("vcs.ref.head.name", run.branch),
      attr("vcs.ref.head.revision", run.sha),
      attr("vcs.repository.url.full", run.repoUrl),
    ],
    status: statusOf(run.conclusion),
  };

  const spans = [rootSpan];
  for (const job of jobs) {
    const jobSpanId = hex(8);
    const jobStart = job.startedAt ?? run.startedAt;
    const jobEnd = job.completedAt ?? run.completedAt;
    spans.push({
      traceId,
      spanId: jobSpanId,
      // @ts-expect-error parentSpanId is absent on the root span's type
      parentSpanId: rootSpanId,
      name: job.name,
      kind: 1,
      startTimeUnixNano: nanos(jobStart),
      endTimeUnixNano: nanos(jobEnd),
      attributes: [
        attr("cicd.pipeline.task.name", job.name),
        attr("cicd.pipeline.task.run.id", job.id),
        attr("cicd.pipeline.task.run.result", job.conclusion),
        attr("cicd.pipeline.task.run.url.full", job.htmlUrl),
      ],
      status: statusOf(job.conclusion),
    });
    for (const step of job.steps) {
      // Skipped steps arrive with epoch-0 timestamps - no span for those.
      if (!step.startedAt || !step.completedAt) continue;
      if (Date.parse(step.startedAt) <= 0) continue;
      spans.push({
        traceId,
        spanId: hex(8),
        // @ts-expect-error see above
        parentSpanId: jobSpanId,
        name: `${job.name}: ${step.name}`,
        kind: 1,
        startTimeUnixNano: nanos(step.startedAt),
        endTimeUnixNano: nanos(step.completedAt),
        attributes: [
          attr("cicd.pipeline.task.name", step.name),
          attr("cicd.pipeline.task.run.result", step.conclusion),
        ],
        status: statusOf(step.conclusion),
      });
    }
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attr("service.name", "cicd"),
            attr("service.namespace", "obs-lab"),
            attr("service.instance.id", "ci-shim"),
          ],
        },
        scopeSpans: [{ scope: { name: "ci-shim" }, spans }],
      },
    ],
  };
}

export async function postTrace(otlpBase: string, payload: unknown): Promise<void> {
  const res = await fetch(`${otlpBase.replace(/\/$/, "")}/v1/traces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OTLP push failed: ${res.status} ${await res.text()}`);
}

/**
 * Grafana deploy annotation - the correlation primitive ("what changed right
 * before this?"). One per deployed service, tagged deployment,<svc>,<sha>,
 * placed at the run's completion time. Grafana runs anonymous-Admin in this
 * lab, so no token is needed.
 */
export async function postDeployAnnotations(
  grafanaBase: string,
  services: string[],
  run: RunInfo,
): Promise<void> {
  const timeMs = Date.parse(run.completedAt);
  const results = await Promise.all(
    services.map((svc) =>
      fetch(`${grafanaBase.replace(/\/$/, "")}/api/annotations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          time: timeMs,
          tags: ["deployment", svc, run.sha],
          text: `deploy ${svc} :${run.sha.slice(0, 7)} (<a href="${run.htmlUrl}">${run.workflowName} #${run.runNumber}</a>)`,
        }),
      }).then((res) => ({ svc, ok: res.ok, status: res.status })),
    ),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    throw new Error(
      failed.map((f) => `annotation post failed for ${f.svc}: ${f.status}`).join("; "),
    );
  }
}
