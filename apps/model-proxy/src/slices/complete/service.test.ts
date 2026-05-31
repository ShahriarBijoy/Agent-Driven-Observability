import { describe, expect, it } from "vitest";
import { CompleteRequestSchema } from "@obs/contracts";
import type { FaultConfig } from "../../platform/config";
import { createCompleteService } from "./service";

const DISABLED_FAULTS: FaultConfig = {
  faultsEnabled: false,
  p500: 0.5,
  p429: 0.5,
  pStall: 0.5,
  stallMs: 30000,
  latencyBaseMs: 40,
  latencyGammaShape: 2.0,
  latencyGammaScaleMs: 60,
  latencyMaxMs: 4000,
  pBadMinute: 0.5,
  badMinuteMs: 60000,
  badMinuteMultiplier: 8,
};

function makeRequest(input: { prompt: string; context?: string[]; maxTokens?: number }) {
  return CompleteRequestSchema.parse(input);
}

describe("complete service (faults disabled)", () => {
  it("never errors and returns finishReason=stop even with high fault probabilities", async () => {
    // RNG returns 0 (would trip every fault) but FAULTS_ENABLED=false ignores it.
    const svc = createCompleteService({ faults: DISABLED_FAULTS, rng: () => 0 });
    const results = await Promise.all(
      Array.from({ length: 50 }, (_unused, i) =>
        svc.complete(makeRequest({ prompt: `prompt-${i}`, context: ["a chunk"] })),
      ),
    );
    for (const res of results) {
      expect(res.finishReason).toBe("stop");
      expect(res.model).toBe("mock-llm-v1");
      expect(res.completion.length).toBeGreaterThan(0);
    }
  });

  it("references the retrieved context so the gateway can prove chunk use", async () => {
    const svc = createCompleteService({ faults: DISABLED_FAULTS, rng: () => 0 });
    const res = await svc.complete(
      makeRequest({ prompt: "q", context: ["The retrieved evidence chunk."] }),
    );
    expect(res.completion).toContain("The retrieved evidence chunk.");
  });

  it("throws model_error (500) when the fault model selects a 500", async () => {
    const faults: FaultConfig = { ...DISABLED_FAULTS, faultsEnabled: true, p500: 1 };
    const svc = createCompleteService({ faults, rng: () => 0.99, now: () => 0 });
    await expect(svc.complete(makeRequest({ prompt: "boom" }))).rejects.toMatchObject({
      code: "model_error",
      status: 500,
    });
  });

  it("throws model_overloaded (429) when the fault model selects a 429", async () => {
    const faults: FaultConfig = { ...DISABLED_FAULTS, faultsEnabled: true, p500: 0, p429: 1 };
    const svc = createCompleteService({ faults, rng: () => 0.99, now: () => 0 });
    await expect(svc.complete(makeRequest({ prompt: "busy" }))).rejects.toMatchObject({
      code: "model_overloaded",
      status: 429,
    });
  });
});
