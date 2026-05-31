import { describe, expect, it } from "vitest";
import type { FaultConfig } from "../../platform/config";
import type { Rng } from "./faults";
import { decideFault, resetBadMinute, sampleGamma, sampleLatencyMs } from "./faults";

const BASE_CONFIG: FaultConfig = {
  faultsEnabled: true,
  p500: 0.01,
  p429: 0.03,
  pStall: 0.01,
  stallMs: 30000,
  latencyBaseMs: 40,
  latencyGammaShape: 2.0,
  latencyGammaScaleMs: 60,
  latencyMaxMs: 4000,
  pBadMinute: 0.002,
  badMinuteMs: 60000,
  badMinuteMultiplier: 8,
};

/** A simple seedable PRNG (Mulberry32) — deterministic uniforms in [0, 1). */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An RNG that returns a fixed value, then cycles a follow-up sequence. */
function fixedRng(values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v ?? 0;
  };
}

describe("sampleGamma", () => {
  it("returns positive, finite numbers across many draws", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 5000; i++) {
      const x = sampleGamma(2.0, 60, rng);
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThan(0);
    }
  });

  it("handles shape < 1 (boosting path) with positive finite output", () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 2000; i++) {
      const x = sampleGamma(0.5, 10, rng);
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThan(0);
    }
  });

  it("rejects non-positive shape or scale", () => {
    const rng = mulberry32(1);
    expect(() => sampleGamma(0, 1, rng)).toThrow();
    expect(() => sampleGamma(1, 0, rng)).toThrow();
  });
});

describe("sampleLatencyMs", () => {
  it("is always >= base and capped at latencyMaxMs", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 5000; i++) {
      const ms = sampleLatencyMs(BASE_CONFIG, rng);
      expect(ms).toBeGreaterThanOrEqual(BASE_CONFIG.latencyBaseMs);
      expect(ms).toBeLessThanOrEqual(BASE_CONFIG.latencyMaxMs);
      expect(Number.isFinite(ms)).toBe(true);
    }
  });
});

describe("decideFault", () => {
  it("with FAULTS_ENABLED=false always returns ok with zero latency and draws no RNG", () => {
    resetBadMinute();
    let calls = 0;
    const rng: Rng = () => {
      calls++;
      return 0;
    };
    const cfg: FaultConfig = { ...BASE_CONFIG, faultsEnabled: false };
    for (let i = 0; i < 100; i++) {
      const outcome = decideFault(cfg, rng);
      expect(outcome.kind).toBe("ok");
      if (outcome.kind === "ok") {
        expect(outcome.latencyMs).toBe(0);
      }
    }
    expect(calls).toBe(0);
  });

  it("returns error_500 when the first relevant draw is below p500", () => {
    resetBadMinute();
    // draw order: badMinute(high→no), 500(low→yes)
    const rng = fixedRng([0.99, 0.0]);
    const outcome = decideFault(BASE_CONFIG, rng, 0);
    expect(outcome.kind).toBe("error_500");
  });

  it("returns error_429 when past p500 but under p429", () => {
    resetBadMinute();
    // badMinute(no), 500(no: >=p500), 429(yes: <p429)
    const rng = fixedRng([0.99, 0.9, 0.0]);
    const outcome = decideFault(BASE_CONFIG, rng, 0);
    expect(outcome.kind).toBe("error_429");
  });

  it("returns stall when past 500/429 but under pStall", () => {
    resetBadMinute();
    // badMinute(no), 500(no), 429(no), stall(yes)
    const rng = fixedRng([0.99, 0.9, 0.9, 0.0]);
    const outcome = decideFault(BASE_CONFIG, rng, 0);
    expect(outcome.kind).toBe("stall");
    if (outcome.kind === "stall") {
      expect(outcome.stallMs).toBe(BASE_CONFIG.stallMs);
    }
  });

  it("clusters errors during a bad minute (raises effective rates)", () => {
    resetBadMinute();
    // First request enters the bad minute: badMinute(yes), then 500 check.
    // With multiplier 8, p500 becomes 0.08; a draw of 0.05 now trips 500.
    const enterRng = fixedRng([0.0, 0.05]);
    const first = decideFault(BASE_CONFIG, enterRng, 1000);
    expect(first.kind).toBe("error_500");

    // A subsequent request still inside the window: same 0.05 draw trips 500
    // even though we don't re-enter (badMinute draw is skipped while active).
    const duringRng = fixedRng([0.05]);
    const second = decideFault(BASE_CONFIG, duringRng, 2000);
    expect(second.kind).toBe("error_500");

    // After the window elapses, 0.05 no longer trips 500 (base rate 0.01).
    const afterRng = fixedRng([0.99, 0.05, 0.9, 0.9, 0.5]);
    const after = decideFault(BASE_CONFIG, afterRng, 1000 + BASE_CONFIG.badMinuteMs + 1);
    expect(after.kind).toBe("ok");
    resetBadMinute();
  });

  it("returns ok with sampled latency when no fault triggers", () => {
    resetBadMinute();
    // badMinute(no), 500(no), 429(no), stall(no), then gamma draws via PRNG.
    const seq = [0.99, 0.9, 0.9, 0.9];
    const prng = mulberry32(7);
    let i = 0;
    const rng: Rng = () => {
      if (i < seq.length) {
        const v = seq[i] ?? 0;
        i++;
        return v;
      }
      return prng();
    };
    const outcome = decideFault(BASE_CONFIG, rng, 0);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.latencyMs).toBeGreaterThanOrEqual(BASE_CONFIG.latencyBaseMs);
      expect(Number.isFinite(outcome.latencyMs)).toBe(true);
    }
  });
});
