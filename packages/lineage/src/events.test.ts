import { describe, expect, it } from "vitest";
import { completeEvent, failEvent, startEvent } from "./events";
import { RUN_EVENT_SCHEMA_URL } from "./spec";

const JOB = { namespace: "ai-observability-lab", name: "rag.inference" };
const RUN_ID = "0190f3d2-1c4a-7b3e-9f21-8a2b3c4d5e6f";
const TIME = "2026-06-03T14:30:00.123Z";

describe("startEvent", () => {
  it("builds a START RunEvent with inputs and no outputs", () => {
    const ev = startEvent({
      runId: RUN_ID,
      job: JOB,
      eventTime: TIME,
      inputs: [{ namespace: "ai-observability-lab", name: "vector_store.chunks" }],
    });
    expect(ev.eventType).toBe("START");
    expect(ev.eventTime).toBe(TIME);
    expect(ev.run.runId).toBe(RUN_ID);
    expect(ev.job).toEqual({
      namespace: "ai-observability-lab",
      name: "rag.inference",
      facets: {},
    });
    expect(ev.inputs).toEqual([{ namespace: "ai-observability-lab", name: "vector_store.chunks" }]);
    expect(ev.outputs).toEqual([]);
    expect(ev.schemaURL).toBe(RUN_EVENT_SCHEMA_URL);
    expect(ev.producer).toContain("observability-tools");
  });

  it("attaches run facets when provided", () => {
    const ev = startEvent({
      runId: RUN_ID,
      job: JOB,
      eventTime: TIME,
      runFacets: { parent: { _producer: "x", _schemaURL: "y", run: { runId: "p" }, job: {} } },
    });
    expect(ev.run.facets).toHaveProperty("parent");
  });
});

describe("completeEvent", () => {
  it("builds a COMPLETE RunEvent reusing the runId with outputs + run facets", () => {
    const ev = completeEvent({
      runId: RUN_ID,
      job: JOB,
      eventTime: TIME,
      outputs: [{ namespace: "ai-observability-lab", name: "completions.recent" }],
      runFacets: { retrievalStats: { count: 3 } },
    });
    expect(ev.eventType).toBe("COMPLETE");
    expect(ev.run.runId).toBe(RUN_ID);
    expect(ev.outputs).toEqual([{ namespace: "ai-observability-lab", name: "completions.recent" }]);
    expect(ev.run.facets).toHaveProperty("retrievalStats");
  });
});

describe("failEvent", () => {
  it("builds a FAIL RunEvent carrying an errorMessage facet from the error", () => {
    const ev = failEvent({
      runId: RUN_ID,
      job: JOB,
      eventTime: TIME,
      error: new Error("model-proxy timed out"),
    });
    expect(ev.eventType).toBe("FAIL");
    const facet = ev.run.facets["errorMessage"] as { message: string; programmingLanguage: string };
    expect(facet.message).toBe("model-proxy timed out");
    expect(facet.programmingLanguage).toBe("JavaScript");
  });
});
