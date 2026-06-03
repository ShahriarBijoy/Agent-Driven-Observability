import { describe, expect, it } from "vitest";
import { PRODUCER } from "./spec";
import { parentRunFacet, retrievalStatsFacet } from "./facets";

describe("retrievalStatsFacet", () => {
  it("summarises a set of relevance scores", () => {
    const facet = retrievalStatsFacet([0.2, 0.8, 0.5]);
    expect(facet).toEqual({
      _producer: PRODUCER,
      _schemaURL: expect.stringContaining("RetrievalStatsRunFacet"),
      count: 3,
      min: 0.2,
      max: 0.8,
      mean: 0.5,
    });
  });

  it("reports nulls (not NaN) for an empty retrieval", () => {
    const facet = retrievalStatsFacet([]);
    expect(facet.count).toBe(0);
    expect(facet.min).toBeNull();
    expect(facet.max).toBeNull();
    expect(facet.mean).toBeNull();
  });
});

describe("parentRunFacet", () => {
  it("links a child run to its parent run and job", () => {
    const facet = parentRunFacet({
      runId: "11111111-1111-1111-1111-111111111111",
      jobNamespace: "ai-observability-lab",
      jobName: "rag.inference",
    });
    expect(facet).toEqual({
      _producer: PRODUCER,
      _schemaURL: expect.stringContaining("ParentRunFacet"),
      run: { runId: "11111111-1111-1111-1111-111111111111" },
      job: { namespace: "ai-observability-lab", name: "rag.inference" },
    });
  });
});
