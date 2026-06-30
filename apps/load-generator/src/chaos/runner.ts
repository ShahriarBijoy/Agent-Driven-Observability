import type { Summary } from "../stats";
import { applyPhase, clearPhase, resetAll, type AdminDeps } from "./admin";
import { buildTimeline, type Schedule } from "./schedule";

export interface ChaosRunnerDeps extends AdminDeps {
  readonly schedule: Schedule;
  /** Traffic driver — resolves when the cycle's wall-clock has elapsed. */
  readonly load: () => Promise<Summary>;
}

/**
 * Run a chaos cycle: drive baseline traffic for the full duration while, on a
 * clock, applying and clearing each phase's chaos against the subject services'
 * control planes. The traffic driver owns the wall-clock; the phase timers are
 * cleared and chaos reset in a `finally` so a service is never left degraded.
 */
export async function runChaos(deps: ChaosRunnerDeps): Promise<Summary> {
  const events = buildTimeline(deps.schedule);
  const timers = events.map((ev) =>
    setTimeout(() => {
      void (ev.kind === "apply" ? applyPhase(deps, ev.phase) : clearPhase(deps, ev.phase));
    }, ev.atMs),
  );

  try {
    return await deps.load();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await resetAll(deps);
  }
}
