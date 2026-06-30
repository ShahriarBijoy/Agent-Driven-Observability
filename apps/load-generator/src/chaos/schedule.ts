import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** Services the chaos scheduler can drive via their `/admin/chaos` control plane. */
export const CHAOS_TARGETS = ["model-proxy", "retriever"] as const;
export type ChaosTarget = (typeof CHAOS_TARGETS)[number];

const PhaseSchema = z.object({
  /** Human-readable phase name (shown in the transcript). */
  name: z.string().min(1),
  /** Which service's chaos control plane to drive. */
  target: z.enum(CHAOS_TARGETS),
  /** Offset from the start of the cycle at which the phase begins. */
  startSeconds: z.coerce.number().nonnegative(),
  /** How long the phase lasts before chaos is cleared. */
  durationSeconds: z.coerce.number().positive(),
  /** Partial knobs POSTed verbatim to the target's `/admin/chaos`. */
  params: z.record(z.string(), z.unknown()).default({}),
});

export const ScheduleSchema = z.object({
  description: z.string().optional(),
  /**
   * Extra baseline traffic after the last phase ends, so SLIs recover and
   * burn-rate alerts resolve before the cycle exits. Defaults to 60s.
   */
  cooldownSeconds: z.coerce.number().nonnegative().default(60),
  phases: z.array(PhaseSchema),
});

export type ChaosPhase = z.infer<typeof PhaseSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;

/** Parse + validate a chaos schedule from YAML text. */
export function parseSchedule(text: string): Schedule {
  return ScheduleSchema.parse(parseYaml(text));
}

/** Load + validate a chaos schedule from a YAML file. */
export async function loadSchedule(path: string): Promise<Schedule> {
  return parseSchedule(await readFile(path, "utf8"));
}

/** Total wall-clock the cycle runs: last phase end + cooldown (min 1s). */
export function totalDurationSeconds(schedule: Schedule): number {
  const lastEnd = schedule.phases.reduce(
    (max, p) => Math.max(max, p.startSeconds + p.durationSeconds),
    0,
  );
  return Math.max(1, lastEnd + schedule.cooldownSeconds);
}

export interface TimelineEvent {
  readonly atMs: number;
  readonly kind: "apply" | "clear";
  readonly phase: ChaosPhase;
}

/**
 * Flatten phases into a time-ordered apply/clear event list. Pure → unit-tested.
 * When an apply and a clear land at the same instant, the clear runs first so
 * back-to-back phases on the same target hand off cleanly.
 */
export function buildTimeline(schedule: Schedule): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const phase of schedule.phases) {
    events.push({ atMs: phase.startSeconds * 1000, kind: "apply", phase });
    events.push({
      atMs: (phase.startSeconds + phase.durationSeconds) * 1000,
      kind: "clear",
      phase,
    });
  }
  return events.sort((a, b) => {
    if (a.atMs !== b.atMs) return a.atMs - b.atMs;
    if (a.kind === b.kind) return 0;
    return a.kind === "clear" ? -1 : 1;
  });
}
