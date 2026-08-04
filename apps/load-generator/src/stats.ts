import type { Bucket } from "./classify";
import { BUCKETS } from "./classify";

export type BucketCounts = Record<Bucket, number>;

/** A summary of a completed load run. Printed as a table and as JSON at exit. */
export interface Summary {
  readonly total: number;
  readonly durationSeconds: number;
  readonly achievedQps: number;
  readonly counts: BucketCounts;
  readonly latencyMs: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  };
}

/** Zeroed bucket counters. */
export function emptyCounts(): BucketCounts {
  const counts = {} as Record<Bucket, number>;
  for (const b of BUCKETS) counts[b] = 0;
  return counts;
}

/**
 * Nearest-rank percentile over a list of latencies (milliseconds). `p` is in
 * [0, 100]. Returns 0 for an empty sample. Does not mutate the input.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(Math.max(rank, 1), sorted.length) - 1;
  const value = sorted[idx];
  return value ?? 0;
}

/** Aggregate per-request buckets + latencies into a printable Summary. */
export function summarize(
  counts: BucketCounts,
  latenciesMs: readonly number[],
  durationSeconds: number,
): Summary {
  const total = BUCKETS.reduce((sum, b) => sum + counts[b], 0);
  const achievedQps = durationSeconds > 0 ? total / durationSeconds : 0;
  return {
    total,
    durationSeconds,
    achievedQps,
    counts,
    latencyMs: {
      p50: percentile(latenciesMs, 50),
      p95: percentile(latenciesMs, 95),
      p99: percentile(latenciesMs, 99),
    },
  };
}

/** Render a Summary as a human-readable table string. */
export function formatTable(summary: Summary): string {
  const c = summary.counts;
  const lines = [
    "Load generator summary",
    "----------------------",
    `total          ${summary.total}`,
    `duration (s)   ${summary.durationSeconds.toFixed(1)}`,
    `achieved QPS   ${summary.achievedQps.toFixed(2)}`,
    "",
    `ok (2xx)       ${c.ok}`,
    `rateLimited    ${c.rateLimited}`,
    `clientError    ${c.clientError}`,
    `serverError    ${c.serverError}`,
    `timeout        ${c.timeout}`,
    "",
    `latency p50    ${summary.latencyMs.p50.toFixed(1)} ms`,
    `latency p95    ${summary.latencyMs.p95.toFixed(1)} ms`,
    `latency p99    ${summary.latencyMs.p99.toFixed(1)} ms`,
  ];
  return lines.join("\n");
}
