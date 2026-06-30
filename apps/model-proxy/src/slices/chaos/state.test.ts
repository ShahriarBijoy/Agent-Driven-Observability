import { afterEach, describe, expect, it } from "vitest";
import type { FaultConfig } from "../../platform/config";
import { clearFaultOverride, effectiveFaults, getFaultOverride, setFaultOverride } from "./state";

const BASE: FaultConfig = {
  faultsEnabled: true,
  p500: 0.01,
  p429: 0.03,
  pStall: 0.01,
  stallMs: 30000,
  latencyBaseMs: 40,
  latencyGammaShape: 2,
  latencyGammaScaleMs: 60,
  latencyMaxMs: 4000,
  pBadMinute: 0.002,
  badMinuteMs: 60000,
  badMinuteMultiplier: 8,
};

afterEach(() => {
  clearFaultOverride();
});

describe("model-proxy chaos override", () => {
  it("starts empty and resolves to the base config", () => {
    expect(getFaultOverride()).toEqual({});
    expect(effectiveFaults(BASE)).toEqual(BASE);
  });

  it("merges successive patches and overrides only the named knobs", () => {
    setFaultOverride({ p500: 0.6 });
    setFaultOverride({ latencyBaseMs: 2500 });

    expect(getFaultOverride()).toEqual({ p500: 0.6, latencyBaseMs: 2500 });
    const effective = effectiveFaults(BASE);
    expect(effective.p500).toBe(0.6);
    expect(effective.latencyBaseMs).toBe(2500);
    // Untouched knobs keep their base values.
    expect(effective.p429).toBe(BASE.p429);
    expect(effective.stallMs).toBe(BASE.stallMs);
  });

  it("clear reverts to the base config", () => {
    setFaultOverride({ p500: 0.9, faultsEnabled: false });
    clearFaultOverride();

    expect(getFaultOverride()).toEqual({});
    expect(effectiveFaults(BASE)).toEqual(BASE);
  });

  it("does not mutate the base config object", () => {
    setFaultOverride({ p500: 0.5 });
    effectiveFaults(BASE);
    expect(BASE.p500).toBe(0.01);
  });
});
