import type { ExamResult, ExamRun } from "@obs/contracts";
import { describe, expect, it } from "vitest";
import {
  buildScorecard,
  criterionTotals,
  formatAccuracy,
  formatSeconds,
  pooledAccuracy,
  scoreRun,
} from "./scorecard";

const RUN: ExamRun = {
  id: "exam_1",
  group: "config",
  startedAt: "2026-08-03T20:00:00.000Z",
  gitSha: "abc1234",
};

function graded(scenarioId: string, verdicts: boolean[], cheated = false): ExamResult {
  const [componentCorrect, causeCategoryCorrect, evidenceCited, remediationAppropriate] = verdicts;
  return {
    scenarioId,
    status: "graded",
    examRunId: RUN.id,
    componentCorrect,
    causeCategoryCorrect,
    evidenceCited,
    remediationAppropriate,
    cheated,
    // Derived by agent-service, so the fixture carries what the wire carries.
    score: cheated ? 0 : verdicts.filter(Boolean).length,
  };
}

function ungraded(scenarioId: string, status: ExamResult["status"]): ExamResult {
  return { scenarioId, status, examRunId: RUN.id };
}

describe("scoreRun", () => {
  it("scores graded rows out of four criteria each", () => {
    const s = scoreRun(RUN, [
      graded("15-stale-secret", [true, true, true, true]),
      graded("02-error-storm", [false, false, false, false]),
    ]);
    expect(s.scored).toBe(4);
    expect(s.possible).toBe(8);
    expect(s.accuracy).toBe(0.5);
  });

  // The rule the whole page rests on: a harness failure is not a wrong answer.
  it("excludes not_run, no_alert and error rows from the denominator", () => {
    const s = scoreRun(RUN, [
      graded("15-stale-secret", [true, true, true, true]),
      ungraded("01-latency", "not_run"),
      ungraded("03-crashloop", "no_alert"),
      ungraded("04-oomkill", "error"),
    ]);
    expect(s.possible).toBe(4);
    expect(s.accuracy).toBe(1);
    expect(s.notRun).toBe(1);
    expect(s.noAlert).toBe(1);
    expect(s.errored).toBe(1);
  });

  it("reports no accuracy at all when nothing was graded, rather than zero", () => {
    const s = scoreRun(RUN, [ungraded("01-latency", "not_run")]);
    expect(s.accuracy).toBeNull();
    expect(formatAccuracy(s.accuracy)).toBe("—");
  });

  it("keeps an interrupted run with no rows visible and unscored", () => {
    const s = scoreRun(RUN, []);
    expect(s.results).toEqual([]);
    expect(s.accuracy).toBeNull();
  });

  it("counts a cheated row as graded but worth nothing", () => {
    const s = scoreRun(RUN, [graded("15-stale-secret", [true, true, true, true], true)]);
    expect(s.cheated).toBe(1);
    expect(s.graded).toBe(1);
    expect(s.possible).toBe(4);
    expect(s.scored).toBe(0);
    expect(s.accuracy).toBe(0);
  });
});

describe("buildScorecard", () => {
  const older: ExamRun = { ...RUN, id: "exam_0", startedAt: "2026-08-01T09:00:00.000Z" };

  it("groups results under their run, newest first", () => {
    const rows = [
      graded("15-stale-secret", [true, true, true, true]),
      { ...graded("01-latency", [true, false, false, false]), examRunId: older.id },
    ];
    const cards = buildScorecard([older, RUN], rows);
    expect(cards.map((c) => c.run.id)).toEqual(["exam_1", "exam_0"]);
    expect(cards[0]?.results.map((r) => r.scenarioId)).toEqual(["15-stale-secret"]);
    expect(cards[1]?.results.map((r) => r.scenarioId)).toEqual(["01-latency"]);
  });

  it("ignores an orphan row whose run is unknown", () => {
    const orphan: ExamResult = { scenarioId: "x", status: "graded", score: 4 };
    const cards = buildScorecard([RUN], [orphan]);
    expect(cards[0]?.results).toEqual([]);
  });
});

describe("pooledAccuracy", () => {
  it("weighs runs by points, not by run count", () => {
    const big = scoreRun(RUN, [
      graded("a", [true, true, true, true]),
      graded("b", [true, true, true, true]),
      graded("c", [true, true, true, true]),
    ]);
    const small = scoreRun(RUN, [graded("d", [false, false, false, false])]);
    // 12 of 16 points, not the 50% a per-run mean would report.
    expect(pooledAccuracy([big, small])).toBe(0.75);
  });

  it("is null when no run scored anything", () => {
    expect(pooledAccuracy([scoreRun(RUN, [])])).toBeNull();
  });
});

describe("criterionTotals", () => {
  it("counts each criterion across graded rows only", () => {
    const totals = criterionTotals([
      graded("a", [true, true, false, false]),
      graded("b", [true, false, false, false]),
      ungraded("c", "no_alert"),
    ]);
    expect(totals).toEqual({
      graded: 2,
      componentCorrect: 2,
      causeCategoryCorrect: 1,
      evidenceCited: 0,
      remediationAppropriate: 0,
    });
  });
});

describe("formatSeconds", () => {
  it("renders sub-minute, over-minute and missing values", () => {
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(145)).toBe("2m 25s");
    expect(formatSeconds(undefined)).toBe("—");
  });
});
