import { type Counter, createHistogram, getMeter, type Histogram } from "@obs/telemetry";

// Gateway-specific business metrics. Fleet-wide RED (`request_duration_seconds`,
// `active_requests`) is already emitted by `honoTelemetry`, so it is not
// recreated here. See docs/adr/003-application-observability.md §4c.
const meter = getMeter("gateway");

const tokensIn: Counter = meter.createCounter("tokens_in_total", {
  description: "Prompt tokens consumed per completion.",
});

const tokensOut: Counter = meter.createCounter("tokens_out_total", {
  description: "Completion tokens produced per completion.",
});

const rateLimitRejections: Counter = meter.createCounter("rate_limit_rejections_total", {
  description: "Requests rejected by the tenant rate limiter.",
});

const retrievalRelevance: Histogram = createHistogram(meter, "retrieval_relevance_score", {
  description: "Per-chunk retrieval relevance score.",
  boundaries: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
});

// Top-1 (best) retrieval score per request — the signal behind the RAG-quality
// SLO ("90% of retrievals have a top-1 score >= 0.6"). The 0.6 boundary is the
// SLO threshold, so the SLI counts exactly against it.
const retrievalTopScore: Histogram = createHistogram(meter, "retrieval_top_score", {
  description: "Top-1 (best) retrieval relevance score per request.",
  boundaries: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
});

const cacheHit: Histogram = createHistogram(meter, "cache_hit_ratio", {
  description: "1 on an embedder cache hit, 0 on a miss (mean = hit ratio).",
  boundaries: [0, 0.25, 0.5, 0.75, 1],
});

/** Record prompt tokens consumed for a completion. */
export function recordTokensIn(value: number, attrs: { tenant: string; model: string }): void {
  tokensIn.add(value, attrs);
}

/** Record completion tokens produced for a completion. */
export function recordTokensOut(value: number, attrs: { tenant: string; model: string }): void {
  tokensOut.add(value, attrs);
}

/** Increment the rate-limit rejection counter for a tenant. */
export function recordRateLimitRejection(attrs: { tenant: string }): void {
  rateLimitRejections.add(1, attrs);
}

/** Record a single retrieved chunk's relevance score. */
export function recordRetrievalRelevance(score: number): void {
  retrievalRelevance.record(score);
}

/** Record the top-1 (best) retrieval score for a request. */
export function recordRetrievalTopScore(score: number): void {
  retrievalTopScore.record(score);
}

/** Record an embedder cache outcome (`true` hit, `false` miss). */
export function recordCacheHit(hit: boolean): void {
  cacheHit.record(hit ? 1 : 0);
}
