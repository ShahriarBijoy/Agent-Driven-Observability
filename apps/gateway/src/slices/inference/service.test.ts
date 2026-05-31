import { describe, expect, it } from "vitest";
import type { RetrievedChunk } from "@obs/contracts";
import { createNoopUsageWriter } from "../usage-metering";
import type { UsageRecord, UsageWriter } from "../usage-metering";
import { createInferenceService } from "./service";
import type {
  CompleteOutcome,
  EmbedderClient,
  ModelClient,
  RetrieverClient,
} from "./ports/clients";

function fakeEmbedder(cached: boolean): EmbedderClient {
  return {
    async embed() {
      return { embedding: new Array(384).fill(0.1) as number[], cached };
    },
  };
}

function fakeRetriever(chunks: RetrievedChunk[]): RetrieverClient {
  return {
    async retrieve() {
      return chunks;
    },
  };
}

function recordingModel(): { client: ModelClient; contexts: string[][] } {
  const contexts: string[][] = [];
  const client: ModelClient = {
    async complete(_prompt, context): Promise<CompleteOutcome> {
      contexts.push(context);
      return {
        completion: `Based on: "${context[0] ?? ""}" here is the answer.`,
        model: "mock-llm-v1",
        finishReason: "stop",
        usage: { promptTokens: 12, completionTokens: 7 },
      };
    },
  };
  return { client, contexts };
}

const CHUNKS: RetrievedChunk[] = [
  { chunkId: "1342-0", docId: "1342", body: "x".repeat(200), score: 0.91 },
  { chunkId: "1342-1", docId: "1342", body: "second chunk body", score: 0.77 },
];

describe("inference orchestration", () => {
  it("returns the expected ChatResponse and surfaces 160-char snippets", async () => {
    const { client: model } = recordingModel();
    const svc = createInferenceService({
      embedder: fakeEmbedder(true),
      retriever: fakeRetriever(CHUNKS),
      model,
      usage: createNoopUsageWriter(),
    });

    const res = await svc.chat({ tenant: "acme", prompt: "what is x?", topK: 3 });

    expect(res.model).toBe("mock-llm-v1");
    expect(res.completion).toContain("Based on:");
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 7 });
    expect(res.cached).toBe(true);
    expect(res.retrieved).toHaveLength(2);
    expect(res.retrieved[0]).toEqual({
      chunkId: "1342-0",
      docId: "1342",
      score: 0.91,
      snippet: "x".repeat(160),
    });
    expect(res.retrieved[0]?.snippet).toHaveLength(160);
    expect(res.retrieved[1]?.snippet).toBe("second chunk body");
  });

  it("passes the retrieved chunk bodies as the model context", async () => {
    const { client: model, contexts } = recordingModel();
    const svc = createInferenceService({
      embedder: fakeEmbedder(false),
      retriever: fakeRetriever(CHUNKS),
      model,
      usage: createNoopUsageWriter(),
    });

    await svc.chat({ tenant: "acme", prompt: "what is x?", topK: 3 });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toEqual([CHUNKS[0]?.body, CHUNKS[1]?.body]);
  });

  it("writes one usage row per successful chat", async () => {
    const written: UsageRecord[] = [];
    const usage: UsageWriter = {
      async write(record) {
        written.push(record);
      },
      async close() {},
    };
    const { client: model } = recordingModel();
    const svc = createInferenceService({
      embedder: fakeEmbedder(false),
      retriever: fakeRetriever(CHUNKS),
      model,
      usage,
    });

    await svc.chat({ tenant: "bravo", prompt: "hi", topK: 2 });

    expect(written).toEqual([
      { tenant: "bravo", promptTokens: 12, completionTokens: 7, model: "mock-llm-v1" },
    ]);
  });

  it("does not fail the request when the usage write throws", async () => {
    const throwingUsage: UsageWriter = {
      async write() {
        throw new Error("db down");
      },
      async close() {},
    };
    const { client: model } = recordingModel();
    const svc = createInferenceService({
      embedder: fakeEmbedder(false),
      retriever: fakeRetriever(CHUNKS),
      model,
      usage: throwingUsage,
    });

    const res = await svc.chat({ tenant: "acme", prompt: "hi", topK: 1 });
    expect(res.completion).toContain("Based on:");
  });
});
