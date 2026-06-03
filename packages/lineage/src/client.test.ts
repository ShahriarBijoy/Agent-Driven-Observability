import { describe, expect, it, vi } from "vitest";
import { createLineageEmitter } from "./client";

const JOB = { namespace: "ai-observability-lab", name: "rag.inference" };
const RUN_ID = "0190f3d2-1c4a-7b3e-9f21-8a2b3c4d5e6f";
const TIME = "2026-06-03T14:30:00.123Z";

function recordingFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 201 });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("createLineageEmitter", () => {
  it("POSTs a START event to /api/v1/lineage with the run id and stamped time", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const emitter = createLineageEmitter({
      url: "http://marquez-api:5000",
      enabled: true,
      fetchImpl,
      now: () => TIME,
    });

    await emitter.start({ runId: RUN_ID, job: JOB, inputs: [{ namespace: "ns", name: "x" }] });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://marquez-api:5000/api/v1/lineage");
    expect(calls[0]!.init.method).toBe("POST");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.eventType).toBe("START");
    expect(body.run.runId).toBe(RUN_ID);
    expect(body.eventTime).toBe(TIME);
  });

  it("merges a parent ref into the run's parent facet", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const emitter = createLineageEmitter({
      url: "http://x",
      enabled: true,
      fetchImpl,
      now: () => TIME,
    });

    await emitter.start({
      runId: RUN_ID,
      job: JOB,
      parent: { runId: "parent-run", jobNamespace: "ns", jobName: "rag.inference" },
    });

    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.run.facets.parent.run.runId).toBe("parent-run");
  });

  it("is best-effort: a failed POST does not throw", async () => {
    const emitter = createLineageEmitter({
      url: "http://x",
      enabled: true,
      fetchImpl: (async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
      now: () => TIME,
    });

    await expect(
      emitter.complete({ runId: RUN_ID, job: JOB, outputs: [] }),
    ).resolves.toBeUndefined();
  });

  it("no-ops when disabled (never calls fetch)", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const emitter = createLineageEmitter({
      url: "http://x",
      enabled: false,
      fetchImpl,
      now: () => TIME,
    });

    await emitter.start({ runId: RUN_ID, job: JOB });
    await emitter.fail({ runId: RUN_ID, job: JOB, error: new Error("boom") });

    expect(calls).toHaveLength(0);
  });
});
