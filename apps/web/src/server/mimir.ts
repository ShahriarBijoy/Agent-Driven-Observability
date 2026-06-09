import { serverEnv } from "./env";

/**
 * Thin client for Mimir's Prometheus-compatible HTTP API. Queries mirror the
 * provisioned Grafana dashboards (gateway-red.json) so the home page and the
 * dashboards agree on what "the golden signals" means.
 */

export interface GoldenSignals {
  /** Requests per second across the gateway (5m rate). */
  requestRate: number | null;
  /** Percentage of requests answering 5xx (5m rate). */
  errorRatePct: number | null;
  /** Gateway latency quantiles in milliseconds, from span metrics. */
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

async function instantQuery(promql: string): Promise<number | null> {
  const url = `${serverEnv.mimirUrl}/prometheus/api/v1/query?query=${encodeURIComponent(promql)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status: string;
      data?: { result?: Array<{ value?: [number, string] }> };
    };
    const raw = body.data?.result?.[0]?.value?.[1];
    if (raw === undefined) return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    // Mimir down or unreachable — the page renders with em-dashes, not errors.
    return null;
  }
}

function latencyQuantile(q: number): string {
  return `histogram_quantile(${q}, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="gateway"}[5m])))`;
}

export async function fetchGoldenSignals(): Promise<GoldenSignals> {
  const [requestRate, errorRatePct, p50, p95, p99] = await Promise.all([
    instantQuery(`sum(rate(request_duration_seconds_count{service="gateway"}[5m]))`),
    instantQuery(
      `100 * sum(rate(request_duration_seconds_count{service="gateway",status_code=~"5.."}[5m])) / sum(rate(request_duration_seconds_count{service="gateway"}[5m]))`,
    ),
    instantQuery(latencyQuantile(0.5)),
    instantQuery(latencyQuantile(0.95)),
    instantQuery(latencyQuantile(0.99)),
  ]);
  return {
    requestRate,
    errorRatePct,
    p50Ms: p50 === null ? null : p50 * 1000,
    p95Ms: p95 === null ? null : p95 * 1000,
    p99Ms: p99 === null ? null : p99 * 1000,
  };
}
