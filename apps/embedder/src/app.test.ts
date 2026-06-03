import { describe, expect, it } from "vitest";
import { createLineageEmitter } from "@obs/lineage";
import { createApp } from "./platform/http";
import { makeCacheStore } from "./slices/cache";
import { mountEmbedSlice } from "./slices/embed/slice";

function buildTestApp() {
  const app = createApp("embedder");
  mountEmbedSlice(app, {
    cache: makeCacheStore({ backend: "memory" }),
    ttlSeconds: 60,
    lineage: createLineageEmitter({ url: "http://marquez-api:5000", enabled: false }),
  });
  return app;
}

describe("embedder HTTP", () => {
  it("GET /health → 200 ok", async () => {
    const res = await buildTestApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "embedder" });
  });

  it("POST /v1/embed → 200 with a 384-dim vector", async () => {
    const res = await buildTestApp().request("/v1/embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { embedding: number[]; dim: number; cached: boolean };
    expect(body.embedding).toHaveLength(384);
    expect(body.dim).toBe(384);
    expect(body.cached).toBe(false);
  });

  it("POST /v1/embed with empty text → 422 error envelope", async () => {
    const res = await buildTestApp().request("/v1/embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
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
    expect(doc.paths["/v1/embed"]).toBeDefined();
  });
});
