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
  /**
   * Whether Mimir answered at all. A null metric means one of two very
   * different things — the telemetry plane is down, or it is up and the
   * gateway simply served no traffic in the window — and the overview has to
   * say which. Without this flag every quiet lab looked like a broken one.
   */
  reachable: boolean;
}

/** Reachable-but-empty is a real answer, so it is distinct from no answer. */
type QueryResult = { reachable: true; value: number | null } | { reachable: false };

async function instantQuery(promql: string): Promise<QueryResult> {
  const url = `${serverEnv.mimirUrl}/prometheus/api/v1/query?query=${encodeURIComponent(promql)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    // A refused query still proves Mimir is listening; only a transport
    // failure means the plane itself is unreachable.
    if (!res.ok) return { reachable: true, value: null };
    const body = (await res.json()) as {
      status: string;
      data?: { result?: Array<{ value?: [number, string] }> };
    };
    const raw = body.data?.result?.[0]?.value?.[1];
    if (raw === undefined) return { reachable: true, value: null };
    const n = Number.parseFloat(raw);
    return { reachable: true, value: Number.isFinite(n) ? n : null };
  } catch {
    // Mimir down or unreachable — the page names the dependency, not an error.
    return { reachable: false };
  }
}

function latencyQuantile(q: number): string {
  return `histogram_quantile(${q}, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="gateway"}[5m])))`;
}

export async function fetchGoldenSignals(): Promise<GoldenSignals> {
  const [requestRate, errorRatePct, p50, p95, p99] = await Promise.all([
    instantQuery(`sum(rate(request_duration_seconds_count{service="gateway"}[5m]))`),
    // `or vector(0)` on the numerator only: with no 5xx series the ratio would
    // otherwise come back empty and render as "unknown" when the truthful
    // answer is zero. The denominator keeps its empty case — no traffic really
    // does mean the error rate is unknown, not 0%.
    instantQuery(
      `100 * (sum(rate(request_duration_seconds_count{service="gateway",http_status_code=~"5.."}[5m])) or vector(0)) / sum(rate(request_duration_seconds_count{service="gateway"}[5m]))`,
    ),
    instantQuery(latencyQuantile(0.5)),
    instantQuery(latencyQuantile(0.95)),
    instantQuery(latencyQuantile(0.99)),
  ]);
  const value = (r: QueryResult) => (r.reachable ? r.value : null);
  const toMs = (r: QueryResult) => {
    const v = value(r);
    return v === null ? null : v * 1000;
  };
  return {
    requestRate: value(requestRate),
    errorRatePct: value(errorRatePct),
    p50Ms: toMs(p50),
    p95Ms: toMs(p95),
    p99Ms: toMs(p99),
    // One query getting through is enough to prove the plane is up.
    reachable: [requestRate, errorRatePct, p50, p95, p99].some((r) => r.reachable),
  };
}
