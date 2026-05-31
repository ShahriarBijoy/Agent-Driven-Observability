import { describe, expect, it } from "vitest";
import type { CompleteResponse } from "@obs/contracts";
import type { FaultConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { mountCompleteSlice } from "./slices/complete/slice";

const DISABLED_FAULTS: FaultConfig = {
  faultsEnabled: false,
  p500: 0,
  p429: 0,
  pStall: 0,
  stallMs: 30000,
  latencyBaseMs: 40,
  latencyGammaShape: 2.0,
  latencyGammaScaleMs: 60,
  latencyMaxMs: 4000,
  pBadMinute: 0,
  badMinuteMs: 60000,
  badMinuteMultiplier: 8,
};

function buildTestApp() {
  const app = createApp("model-proxy");
  mountCompleteSlice(app, { faults: DISABLED_FAULTS });
  return app;
}

describe("model-proxy HTTP", () => {
  it("GET /health → 200 ok", async () => {
    const res = await buildTestApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "model-proxy" });
  });

  it("POST /v1/complete → 200 with a deterministic completion", async () => {
    const res = await buildTestApp().request("/v1/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Tell me about Paris.", context: ["Paris is in France."] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CompleteResponse;
    expect(body.model).toBe("mock-llm-v1");
    expect(body.finishReason).toBe("stop");
    expect(body.completion).toContain("Paris is in France.");
    expect(body.usage.promptTokens).toBeGreaterThanOrEqual(0);
    expect(body.usage.completionTokens).toBeGreaterThanOrEqual(0);
  });

  it("POST /v1/complete is stable across identical requests", async () => {
    const payload = JSON.stringify({ prompt: "deterministic?", context: [] });
    const opts = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    } as const;
    const a = (await (
      await buildTestApp().request("/v1/complete", opts)
    ).json()) as CompleteResponse;
    const b = (await (
      await buildTestApp().request("/v1/complete", opts)
    ).json()) as CompleteResponse;
    expect(a).toEqual(b);
  });

  it("POST /v1/complete with empty prompt → 422 error envelope", async () => {
    const res = await buildTestApp().request("/v1/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code: string } };
    expect(body.error?.code).toBe("validation_error");
  });

  it("serves the OpenAPI document at /doc", async () => {
    const res = await buildTestApp().request("/doc");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.0.0");
    expect(doc.paths["/v1/complete"]).toBeDefined();
  });
});
