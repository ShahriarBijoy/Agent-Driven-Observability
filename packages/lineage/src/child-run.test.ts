import { describe, expect, it } from "vitest";
import { withChildRun } from "./child-run";
import type { LineageEmitter } from "./client";
import type { ParentRef } from "./facets";

const JOB = { namespace: "ai-observability-lab", name: "rag.embed" };
const PARENT: ParentRef = {
  runId: "0190f3d2-1c4a-7b3e-9f21-8a2b3c4d5e6f",
  jobNamespace: "ai-observability-lab",
  jobName: "rag.inference",
};

interface Call {
  readonly type: "start" | "complete" | "fail";
  readonly runId: string;
  readonly parent: ParentRef | null | undefined;
}

function recordingLineage(): { emitter: LineageEmitter; calls: Call[] } {
  const calls: Call[] = [];
  const emitter: LineageEmitter = {
    async start(a) {
      calls.push({ type: "start", runId: a.runId, parent: a.parent });
    },
    async complete(a) {
      calls.push({ type: "complete", runId: a.runId, parent: a.parent });
    },
    async fail(a) {
      calls.push({ type: "fail", runId: a.runId, parent: a.parent });
    },
  };
  return { emitter, calls };
}

describe("withChildRun", () => {
  it("runs work without any lineage when there is no parent", async () => {
    const { emitter, calls } = recordingLineage();
    const result = await withChildRun(emitter, { job: JOB, parent: null }, async () => 42);
    expect(result).toBe(42);
    expect(calls).toEqual([]);
  });

  it("emits START then COMPLETE (same runId, linked to the parent) on success", async () => {
    const { emitter, calls } = recordingLineage();
    const result = await withChildRun(emitter, { job: JOB, parent: PARENT }, async () => "ok");
    expect(result).toBe("ok");
    expect(calls.map((c) => c.type)).toEqual(["start", "complete"]);
    expect(calls[0]!.runId).toBe(calls[1]!.runId);
    expect(calls[0]!.parent).toEqual(PARENT);
  });

  it("emits START then FAIL and rethrows when work throws", async () => {
    const { emitter, calls } = recordingLineage();
    await expect(
      withChildRun(emitter, { job: JOB, parent: PARENT }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls.map((c) => c.type)).toEqual(["start", "fail"]);
    expect(calls[0]!.runId).toBe(calls[1]!.runId);
  });
});
