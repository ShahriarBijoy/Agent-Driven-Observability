import { hashEmbedding, EMBEDDING_DIM } from "@obs/domain";
import { describe, expect, it } from "vitest";
import { createApp } from "./platform/http";
import { createMemoryStore } from "./slices/query/adapters/memory-store";
import { mountQuerySlice } from "./slices/query/slice";

function buildTestApp() {
  const store = createMemoryStore([
    {
      chunkId: "doc-0",
      docId: "doc",
      body: "alpha chunk",
      embedding: hashEmbedding("alpha chunk"),
    },
    { chunkId: "doc-1", docId: "doc", body: "beta chunk", embedding: hashEmbedding("beta chunk") },
    {
      chunkId: "doc-2",
      docId: "doc",
      body: "gamma chunk",
      embedding: hashEmbedding("gamma chunk"),
    },
  ]);
  const app = createApp("retriever");
  mountQuerySlice(app, { store });
  return app;
}

describe("retriever HTTP", () => {
  it("GET /health → 200 ok", async () => {
    const res = await buildTestApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "retriever" });
  });

  it("POST /v1/retrieve → 200 with ranked results, best match first", async () => {
    const res = await buildTestApp().request("/v1/retrieve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embedding: hashEmbedding("beta chunk"), topK: 2 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { chunkId: string; score: number }[] };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]?.chunkId).toBe("doc-1");
    expect(body.results[0]?.score).toBeGreaterThan(body.results[1]?.score ?? 1);
  });

  it("POST /v1/retrieve with a wrong-dimension embedding → 422", async () => {
    const res = await buildTestApp().request("/v1/retrieve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embedding: [1, 2, 3], topK: 5 }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code: string } };
    expect(body.error?.code).toBe("validation_error");
  });

  it("defaults topK to 5 when omitted", async () => {
    const res = await buildTestApp().request("/v1/retrieve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embedding: new Array(EMBEDDING_DIM).fill(0) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results.length).toBeLessThanOrEqual(5);
  });

  it("serves the OpenAPI document at /doc", async () => {
    const res = await buildTestApp().request("/doc");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.0.0");
    expect(doc.paths["/v1/retrieve"]).toBeDefined();
  });
});
