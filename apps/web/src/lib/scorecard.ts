import type { ExamResult, ExamRun } from "@obs/contracts";

/**
 * Scorecard arithmetic for the chaos exam (P12), kept out of the route so the
 * counting rules can be tested rather than eyeballed.
 *
 * The one rule everything else follows from: **only `graded` rows count.**
 * `not_run` means the Claude session died before the question was asked,
 * `no_alert` is a finding about the observability plane, and `error` means the
 * scenario was unusable — none of them is evidence about how well the agent
 * reasons. Folding them in as zeros would quietly turn a broken harness into a
 * bad grade, which is the exact confusion the four statuses exist to prevent.
 */

export type ScoredRun = {
  run: ExamRun;
  /** This run's rows, in the order the runner recorded them. */
  results: ExamResult[];
  graded: number;
  notRun: number;
  noAlert: number;
  errored: number;
  /** Graded rows the judge caught reading the answer key. */
  cheated: number;
  /** Points awarded across graded rows. */
  scored: number;
  /** Points available: graded rows x 4 criteria. */
  possible: number;
  /**
   * `scored / possible`, or **null when nothing was graded** — an exam run
   * that never produced a verdict has no accuracy, and rendering it as 0%
   * would libel the agent for a harness failure. The two empty runs left by an
   * interrupted `obs exam` land here.
   */
  accuracy: number | null;
};

/** How often each criterion was met, across graded rows. */
export type CriterionTotals = {
  graded: number;
  componentCorrect: number;
  causeCategoryCorrect: number;
  evidenceCited: number;
  remediationAppropriate: number;
};

/** `short` is spelled out rather than sliced off `label`: truncating gave
 * column headers like "Caus" and "Reme", which read as typos. */
export const CRITERIA = [
  { key: "componentCorrect", label: "Component", short: "Comp" },
  { key: "causeCategoryCorrect", label: "Cause", short: "Cause" },
  { key: "evidenceCited", label: "Evidence", short: "Evid" },
  { key: "remediationAppropriate", label: "Remediation", short: "Remed" },
] as const satisfies ReadonlyArray<{ key: keyof CriterionTotals; label: string; short: string }>;

export function scoreRun(run: ExamRun, results: ExamResult[]): ScoredRun {
  const graded = results.filter((r) => r.status === "graded");
  // `score` is derived by agent-service and absent on ungraded rows; `?? 0`
  // only ever covers a graded row whose score really is 0 (every criterion
  // false, or `cheated`).
  const scored = graded.reduce((sum, r) => sum + (r.score ?? 0), 0);
  const possible = graded.length * CRITERIA.length;
  return {
    run,
    results,
    graded: graded.length,
    notRun: results.filter((r) => r.status === "not_run").length,
    noAlert: results.filter((r) => r.status === "no_alert").length,
    errored: results.filter((r) => r.status === "error").length,
    cheated: graded.filter((r) => r.cheated === true).length,
    scored,
    possible,
    accuracy: possible === 0 ? null : scored / possible,
  };
}

/**
 * Group results under their runs, newest first. Runs with no rows are kept
 * deliberately — an interrupted sweep is worth seeing on the page, and hiding
 * it would make the exam look tidier than it was.
 */
export function buildScorecard(runs: ExamRun[], results: ExamResult[]): ScoredRun[] {
  const byRun = new Map<string, ExamResult[]>();
  for (const result of results) {
    // Rows without an examRunId are rejected at the API, so this is a guard
    // against an orphan rather than an expected shape.
    if (result.examRunId === undefined) continue;
    const bucket = byRun.get(result.examRunId);
    if (bucket === undefined) byRun.set(result.examRunId, [result]);
    else bucket.push(result);
  }
  return [...runs]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((run) => scoreRun(run, byRun.get(run.id) ?? []));
}

/** Pooled accuracy over several runs — points over points, so a run with more
 * scenarios weighs more than a one-question run. */
export function pooledAccuracy(scored: ScoredRun[]): ScoredRun["accuracy"] {
  const possible = scored.reduce((sum, s) => sum + s.possible, 0);
  if (possible === 0) return null;
  return scored.reduce((sum, s) => sum + s.scored, 0) / possible;
}

export function criterionTotals(results: ExamResult[]): CriterionTotals {
  const graded = results.filter((r) => r.status === "graded");
  const met = (key: (typeof CRITERIA)[number]["key"]) =>
    graded.filter((r) => r[key] === true).length;
  return {
    graded: graded.length,
    componentCorrect: met("componentCorrect"),
    causeCategoryCorrect: met("causeCategoryCorrect"),
    evidenceCited: met("evidenceCited"),
    remediationAppropriate: met("remediationAppropriate"),
  };
}

/** `0.75` -> `"75%"`; null accuracy renders as an em dash, never as `0%`. */
export function formatAccuracy(accuracy: number | null): string {
  return accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`;
}

/** Seconds as `m:ss` past a minute, plain `NNs` below it. */
export function formatSeconds(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ${String(seconds % 60).padStart(2, "0")}s`;
}
