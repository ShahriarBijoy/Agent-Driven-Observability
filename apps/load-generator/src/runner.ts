import type { Bucket, Outcome } from "./classify";
import { classify } from "./classify";
import type { Config } from "./platform/config";
import type { BuiltRequest } from "./scenarios";
import { buildRequest, pickScenario } from "./scenarios";
import type { BucketCounts, Summary } from "./stats";
import { emptyCounts, summarize } from "./stats";

/** A fetch-shaped function (the global `fetch`, or a fake one in tests). */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface RunnerDeps {
  readonly config: Config;
  /** HTTP client; defaults to the global fetch. */
  readonly fetchFn?: FetchFn;
  /** RNG for scenario/body selection; defaults to Math.random. */
  readonly rng?: () => number;
  /** Clock; defaults to performance.now (monotonic, ms). */
  readonly now?: () => number;
}

/** Send a single built request and classify its outcome + latency. */
export async function sendRequest(
  req: BuiltRequest,
  fetchFn: FetchFn,
  timeoutMs: number,
  now: () => number,
): Promise<{ bucket: Bucket; latencyMs: number }> {
  const start = now();
  let outcome: Outcome;
  try {
    const res = await fetchFn(req.url, {
      ...req.init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    outcome = { kind: "status", status: res.status };
  } catch (error) {
    outcome = { kind: "error", error };
  }
  return { bucket: classify(outcome), latencyMs: now() - start };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drive `targetQps` against the gateway for `durationSeconds` with bounded
 * concurrency. A scheduler releases request "tickets" at the target rate; up to
 * `concurrency` requests may be in flight at once. Returns an aggregated Summary.
 */
export async function runLoad(deps: RunnerDeps): Promise<Summary> {
  const { config } = deps;
  const fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
  const rng = deps.rng ?? Math.random;
  const now = deps.now ?? (() => performance.now());

  const counts: BucketCounts = emptyCounts();
  const latencies: number[] = [];

  const intervalMs = 1000 / config.targetQps;
  const deadline = now() + config.durationSeconds * 1000;

  let inFlight = 0;
  const settled: Promise<void>[] = [];

  function dispatch(): void {
    inFlight++;
    const scenario = pickScenario(rng, config.scenarios);
    const req = buildRequest(scenario, config.gatewayUrl, rng);
    const p = sendRequest(req, fetchFn, config.requestTimeoutMs, now)
      .then((result) => {
        counts[result.bucket]++;
        latencies.push(result.latencyMs);
      })
      .finally(() => {
        inFlight--;
      });
    settled.push(p);
  }

  let nextAt = now();
  while (now() < deadline) {
    const t = now();
    if (t >= nextAt && inFlight < config.concurrency) {
      dispatch();
      nextAt += intervalMs;
      // If we have fallen far behind schedule, don't try to "catch up" with an
      // unbounded burst — resync the next slot to now.
      if (nextAt < t - intervalMs) nextAt = t;
      continue;
    }
    // Sleep until the next scheduled slot (or a short slice if at capacity).
    const wait = inFlight >= config.concurrency ? 1 : Math.max(0, Math.min(nextAt - t, 50));
    await sleep(wait);
  }

  await Promise.all(settled);
  return summarize(counts, latencies, config.durationSeconds);
}
