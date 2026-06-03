import { describe, expect, it } from "vitest";
import { parentFromHeaders, parentRunHeaders } from "./headers";

const PARENT = {
  runId: "0190f3d2-1c4a-7b3e-9f21-8a2b3c4d5e6f",
  jobNamespace: "ai-observability-lab",
  jobName: "rag.inference",
};

describe("parentRunHeaders", () => {
  it("serialises a parent ref to lowercase x-ol-* headers", () => {
    expect(parentRunHeaders(PARENT)).toEqual({
      "x-ol-parent-run-id": PARENT.runId,
      "x-ol-parent-job-namespace": "ai-observability-lab",
      "x-ol-parent-job-name": "rag.inference",
    });
  });
});

describe("parentFromHeaders", () => {
  it("round-trips the headers back into a parent ref", () => {
    const headers = parentRunHeaders(PARENT);
    const got = parentFromHeaders((name) => headers[name]);
    expect(got).toEqual(PARENT);
  });

  it("returns null when the parent run-id header is absent", () => {
    expect(parentFromHeaders(() => undefined)).toBeNull();
  });

  it("returns null when only the run-id is present (incomplete parent)", () => {
    const got = parentFromHeaders((name) =>
      name === "x-ol-parent-run-id" ? PARENT.runId : undefined,
    );
    expect(got).toBeNull();
  });
});
