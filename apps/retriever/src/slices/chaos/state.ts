/**
 * Runtime chaos state for the retriever — a dev/lab-only control plane (ADR-006).
 * The Phase-6 chaos scheduler POSTs to `/admin/chaos` to simulate a dependency
 * outage (every `/v1/retrieve` 503s) or a partial brownout (`errorRate`), which
 * the gateway surfaces as 502s — exercising the availability SLO. Module-level
 * so it survives across requests within one process. Not for production.
 */

export interface ChaosState {
  /** When true, every `/v1/retrieve` fails with 503 (a full dependency outage). */
  readonly outage: boolean;
  /** Probability [0,1] that an individual retrieve fails with 503 (partial brownout). */
  readonly errorRate: number;
}

const DEFAULT: ChaosState = { outage: false, errorRate: 0 };

let state: ChaosState = DEFAULT;

/** Merge a partial patch into the active chaos state; returns the new state. */
export function setChaos(patch: Partial<ChaosState>): ChaosState {
  state = { ...state, ...patch };
  return state;
}

/** Clear chaos (back to healthy). */
export function clearChaos(): void {
  state = DEFAULT;
}

/** The current chaos state. */
export function getChaos(): ChaosState {
  return state;
}

/** Decide whether this request should fail, given the chaos state. Pure. */
export function shouldFail(current: ChaosState, rng: () => number = Math.random): boolean {
  if (current.outage) return true;
  return current.errorRate > 0 && rng() < current.errorRate;
}
