import type { FaultConfig } from "../../platform/config";

/**
 * Runtime fault overrides — a dev/lab-only control plane (ADR-005). The Phase-6
 * chaos scheduler POSTs partial fault knobs to `/admin/chaos` to modulate the
 * model-proxy on a clock (latency spikes, error bursts) WITHOUT restarting the
 * container; the override is merged over the env-loaded base config on every
 * request. Module-level so it survives across requests within one process.
 *
 * Not for production — the control plane is gated behind CHAOS_CONTROL_ENABLED
 * in `main.ts` and only ever reachable inside the lab's docker network.
 */

/** The subset of fault knobs the chaos control plane may override (all optional). */
export type FaultOverride = Partial<FaultConfig>;

let override: FaultOverride = {};

/** Merge a partial patch into the active override; returns the new override. */
export function setFaultOverride(patch: FaultOverride): FaultOverride {
  override = { ...override, ...patch };
  return override;
}

/** Clear all overrides (revert to the env-loaded base config). */
export function clearFaultOverride(): void {
  override = {};
}

/** The currently active override (empty when no chaos is in effect). */
export function getFaultOverride(): FaultOverride {
  return override;
}

/** The base config with the active override applied — what a request decides on. */
export function effectiveFaults(base: FaultConfig): FaultConfig {
  return { ...base, ...override };
}
