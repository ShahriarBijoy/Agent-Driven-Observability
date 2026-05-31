import { describe, expect, it } from "vitest";
import { emptyCounts, formatTable, percentile, summarize } from "./stats";

describe("percentile", () => {
  it("returns 0 for an empty sample", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("computes nearest-rank percentiles over 1..100", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 99)).toBe(99);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("summarize", () => {
  it("totals all buckets and derives achieved QPS", () => {
    const counts = emptyCounts();
    counts.ok = 90;
    counts.rateLimited = 5;
    counts.clientError = 3;
    counts.serverError = 1;
    counts.timeout = 1;
    const summary = summarize(counts, [10, 20, 30], 10);
    expect(summary.total).toBe(100);
    expect(summary.achievedQps).toBeCloseTo(10);
    expect(summary.latencyMs.p50).toBe(20);
  });

  it("avoids division by zero when duration is 0", () => {
    const summary = summarize(emptyCounts(), [], 0);
    expect(summary.achievedQps).toBe(0);
  });
});

describe("formatTable", () => {
  it("renders all buckets and latency percentiles", () => {
    const counts = emptyCounts();
    counts.ok = 1;
    const table = formatTable(summarize(counts, [5], 1));
    expect(table).toContain("ok (2xx)");
    expect(table).toContain("rateLimited");
    expect(table).toContain("latency p99");
  });
});
