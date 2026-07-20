// ci-shim - Gitea pipelines as telemetry (PLAN-2 P9).
//
// Consumes Gitea's GitHub-style workflow_run / workflow_job webhooks and,
// when a run completes, emits it as ONE post-hoc OTLP trace batch (live span
// emission would hit Alloy's 10s tail-sampling decision window and orphan
// every step after it), plus DORA metrics and a Grafana deploy annotation.
//
// This file is the HTTP shell; the emission logic lands in P9 task 5.
import { Hono } from "hono";

const port = Number(process.env.CI_SHIM_PORT ?? "8095");
const startedAt = Date.now();

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "ci-shim", uptimeMs: Date.now() - startedAt }),
);

app.post("/webhook", async (c) => {
  const event = c.req.header("x-gitea-event") ?? c.req.header("x-github-event") ?? "unknown";
  const body = await c.req.json().catch(() => ({}));
  console.log(`[ci-shim] webhook event=${event} action=${body?.action ?? "-"}`);
  return c.json({ accepted: true }, 202);
});

console.log(`[ci-shim] listening on :${port}`);

export default { port, fetch: app.fetch };
