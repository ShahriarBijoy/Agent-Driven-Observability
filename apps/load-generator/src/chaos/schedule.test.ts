import { describe, expect, it } from "vitest";
import { buildTimeline, parseSchedule, totalDurationSeconds } from "./schedule";

const YAML = `
description: test cycle
cooldownSeconds: 30
phases:
  - name: error-burst
    target: model-proxy
    startSeconds: 60
    durationSeconds: 120
    params:
      p500: 0.6
  - name: retriever-outage
    target: retriever
    startSeconds: 200
    durationSeconds: 40
    params:
      outage: true
`;

describe("chaos schedule", () => {
  it("parses and validates a YAML schedule", () => {
    const schedule = parseSchedule(YAML);
    expect(schedule.description).toBe("test cycle");
    expect(schedule.cooldownSeconds).toBe(30);
    expect(schedule.phases).toHaveLength(2);
    expect(schedule.phases[0]).toMatchObject({
      name: "error-burst",
      target: "model-proxy",
      startSeconds: 60,
      durationSeconds: 120,
      params: { p500: 0.6 },
    });
  });

  it("defaults cooldown and params when omitted", () => {
    const schedule = parseSchedule(
      "phases:\n  - name: x\n    target: retriever\n    startSeconds: 0\n    durationSeconds: 10\n",
    );
    expect(schedule.cooldownSeconds).toBe(60);
    expect(schedule.phases[0]?.params).toEqual({});
  });

  it("rejects an unknown target", () => {
    expect(() =>
      parseSchedule(
        "phases:\n  - name: x\n    target: gateway\n    startSeconds: 0\n    durationSeconds: 1\n",
      ),
    ).toThrow();
  });

  it("computes total duration as last phase end + cooldown", () => {
    // retriever-outage ends at 200 + 40 = 240; + 30 cooldown = 270.
    expect(totalDurationSeconds(parseSchedule(YAML))).toBe(270);
  });

  it("builds a time-ordered apply/clear timeline", () => {
    const timeline = buildTimeline(parseSchedule(YAML));
    expect(timeline.map((e) => [e.atMs, e.kind, e.phase.name])).toEqual([
      [60_000, "apply", "error-burst"],
      [180_000, "clear", "error-burst"],
      [200_000, "apply", "retriever-outage"],
      [240_000, "clear", "retriever-outage"],
    ]);
  });
});
