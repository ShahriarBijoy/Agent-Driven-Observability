import { describe, expect, it } from "vitest";
import { createLineageEmitter } from "@obs/lineage";
import type { RetrievedChunk } from "@obs/contracts";
import { createApp } from "./platform/http";
import { mountAuthSlice } from "./slices/auth/slice";
import { createMemoryLimiter } from "./slices/rate-limit";
import { mountRateLimitSlice } from "./slices/rate-limit/slice";
import { createNoopInferenceRecorder, createNoopUsageWriter } from "./slices/usage-metering";
import { registerInferenceRoutes } from "./slices/inference/slice";
import type { RateLimiter } from "./slices/rate-limit";
import type {
  EmbedderClient,
  ModelClient,
  RetrieverClient,
} from "./slices/inference/ports/clients";

const CHUNKS: RetrievedChunk[] = [
  { chunkId: "1342-0", docId: "1342", body: "Pride and Prejudice opening line", score: 0.9 },
];

const fakeEmbedder: EmbedderClient = {
  async embed() {
    return { embedding: new Array(384).fill(0) as number[], cached: false };
  },
};
const fakeRetriever: RetrieverClient = {
  async retrieve() {
    return CHUNKS;
  },
};
const fakeModel: ModelClient = {
  async complete(_prompt, context) {
    return {
      completion: `Based on: "${context[0] ?? ""}"`,
      model: "mock-llm-v1",
      finishReason: "stop",
      usage: { promptTokens: 5, completionTokens: 3 },
    };
  },
};

function buildApp(limiter: RateLimiter = createMemoryLimiter()) {
  const app = createApp("gateway");
  mountAuthSlice(app);
  mountRateLimitSlice(app, { limiter });
  registerInferenceRoutes(app, {
    embedder: fakeEmbedder,
    retriever: fakeRetriever,
    model: fakeModel,
    usage: createNoopUsageWriter(),
    recorder: createNoopInferenceRecorder(),
    lineage: createLineageEmitter({ url: "http://marquez-api:5000", enabled: false }),
  });
  return app;
}

function chat(
  app: ReturnType<typeof buildApp>,
  token: string | null,
  body: unknown = { prompt: "hi" },
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return app.request("/v1/chat", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("gateway HTTP", () => {
  it("GET /health → 200 ok", async () => {
    const res = await buildApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "gateway" });
  });

  it("rejects a missing bearer token with 401 unauthorized", async () => {
    const res = await chat(buildApp(), null);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects an unknown bearer token with 401 unauthorized", async () => {
    const res = await chat(buildApp(), "not-a-real-token");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("POST /v1/chat → 200 with completion and retrieved refs", async () => {
    const res = await chat(buildApp(), "dev-local-token", { prompt: "hello", topK: 1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      model: string;
      completion: string;
      retrieved: { snippet: string }[];
      cached: boolean;
    };
    expect(body.model).toBe("mock-llm-v1");
    expect(body.completion).toContain("Based on:");
    expect(body.retrieved).toHaveLength(1);
    expect(body.retrieved[0]?.snippet).toBe("Pride and Prejudice opening line");
    expect(body.cached).toBe(false);
  });

  it("invalid body → 422 validation_error", async () => {
    const res = await chat(buildApp(), "dev-local-token", { prompt: "" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 429 rate_limited once the abuser bucket is exhausted", async () => {
    // Freeze time so no refill happens; abuser capacity is 20.
    const app = buildApp(createMemoryLimiter(() => 5_000));
    let lastStatus = 200;
    let exhaustedBody: { error: { code: string } } | null = null;
    // Requests MUST be sequential so the token bucket drains in order.
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await chat(app, "dev-token-abuser", { prompt: "spam", topK: 1 });
      lastStatus = res.status;
      if (res.status === 429) {
        // eslint-disable-next-line no-await-in-loop
        exhaustedBody = (await res.json()) as { error: { code: string } };
        break;
      }
    }
    expect(lastStatus).toBe(429);
    expect(exhaustedBody?.error.code).toBe("rate_limited");
  });

  it("POST /v1/embed passthrough → 200 with a 384-dim vector", async () => {
    const res = await buildApp().request("/v1/embed", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer dev-local-token" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { embedding: number[]; dim: number };
    expect(body.embedding).toHaveLength(384);
    expect(body.dim).toBe(384);
  });
});
