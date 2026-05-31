/**
 * Pure bucketing logic, kept separate from the request loop so it can be unit
 * tested without a live gateway. A request outcome is classified either from an
 * HTTP status code (the server responded) or from an Error (the client aborted,
 * timed out, or the network failed).
 */

export type Bucket = "ok" | "rateLimited" | "clientError" | "serverError" | "timeout";

/** All buckets, in display order — handy for initializing counters. */
export const BUCKETS: readonly Bucket[] = [
  "ok",
  "rateLimited",
  "clientError",
  "serverError",
  "timeout",
] as const;

/**
 * Classify a completed-with-response request by its HTTP status code.
 *
 * - 2xx                 → ok
 * - 429                 → rateLimited
 * - 504                 → timeout (gateway upstream timeout)
 * - other 4xx           → clientError
 * - other 5xx           → serverError
 */
export function classifyStatus(status: number): Bucket {
  if (status === 429) return "rateLimited";
  if (status === 504) return "timeout";
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400 && status < 500) return "clientError";
  if (status >= 500 && status < 600) return "serverError";
  // Anything else (1xx/3xx or out-of-range) is unexpected for these calls;
  // treat as a server-side anomaly rather than silently dropping it.
  return "serverError";
}

/**
 * Classify a request that threw before producing a usable response: a client
 * abort (AbortSignal.timeout), a network failure, or any other fetch rejection.
 * All of these are bucketed as `timeout` per the spec (504 OR client abort/network).
 */
export function classifyError(_error: unknown): Bucket {
  return "timeout";
}

/** A request outcome: either a status code, or an error if the request threw. */
export type Outcome = { kind: "status"; status: number } | { kind: "error"; error: unknown };

/** Single entry point used by the runner: classify any outcome into a bucket. */
export function classify(outcome: Outcome): Bucket {
  if (outcome.kind === "status") return classifyStatus(outcome.status);
  return classifyError(outcome.error);
}
