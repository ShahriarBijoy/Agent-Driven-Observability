import { afterEach, describe, expect, it } from "vitest";
import { clearChaos, getChaos, setChaos, shouldFail } from "./state";

afterEach(() => {
  clearChaos();
});

describe("retriever chaos state", () => {
  it("starts healthy", () => {
    expect(getChaos()).toEqual({ outage: false, errorRate: 0 });
    expect(shouldFail(getChaos())).toBe(false);
  });

  it("outage fails every request regardless of rng", () => {
    setChaos({ outage: true });
    expect(shouldFail(getChaos(), () => 0.99)).toBe(true);
    expect(shouldFail(getChaos(), () => 0)).toBe(true);
  });

  it("errorRate fails probabilistically against the injected rng", () => {
    setChaos({ errorRate: 0.5 });
    expect(shouldFail(getChaos(), () => 0.4)).toBe(true); // 0.4 < 0.5 → fail
    expect(shouldFail(getChaos(), () => 0.6)).toBe(false); // 0.6 >= 0.5 → pass
  });

  it("merges patches and clears back to healthy", () => {
    setChaos({ errorRate: 0.3 });
    setChaos({ outage: true });
    expect(getChaos()).toEqual({ outage: true, errorRate: 0.3 });

    clearChaos();
    expect(getChaos()).toEqual({ outage: false, errorRate: 0 });
  });
});
