import { describe, expect, it } from "vitest";
import type { LineageEmitter, StartArgs } from "@obs/lineage";
import type { RetrievedChunk } from "@obs/contracts";
import { createNoopInferenceRecorder, createNoopUsageWriter } from "../usage-metering";
import type {
  InferenceRecord,
  InferenceRecorder,
  UsageRecord,
  UsageWriter,
} from "../usage-metering";
import { createInferenceService, type InferenceServiceDeps } from "./service";
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

interface LineageCall {
  readonly type: "start" | "complete" | "fail";
  readonly args: StartArgs | { runId: string; runFacets?: Record<string, unknown> };
}

function recordingLineage(): { emitter: LineageEmitter; calls: LineageCall[] } {
  const calls: LineageCall[] = [];
  const emitter: LineageEmitter = {
    async start(args) {
      calls.push({ type: "start", args });
    },
    async complete(args) {
      calls.push({ type: "complete", args });
    },
    async fail(args) {
      calls.push({ type: "fail", args });
    },
  };
  return { emitter, calls };
}

function recordingRecorder(): { recorder: InferenceRecorder; records: InferenceRecord[] } {
  const records: InferenceRecord[] = [];
  const recorder: InferenceRecorder = {
    async record(record) {
      records.push(record);
    },
    async close() {},
  };
  return { recorder, records };
}

const CHUNKS: RetrievedChunk[] = [
  { chunkId: "1342-0", docId: "1342", body: "x".repeat(200), score: 0.91 },
  { chunkId: "1342-1", docId: "1342", body: "second chunk body", score: 0.77 },
];

function baseDeps(overrides: Partial<InferenceServiceDeps> = {}): InferenceServiceDeps {
  return {
    embedder: fakeEmbedder(false),
    retriever: fakeRetriever(CHUNKS),
    model: recordingModel().client,
    usage: createNoopUsageWriter(),
    recorder: createNoopInferenceRecorder(),
    lineage: recordingLineage().emitter,
    ...overrides,
  };
}

describe("inference orchestration", () => {
  it("returns the expected ChatResponse and surfaces 160-char snippets", async () => {
    const svc = createInferenceService(baseDeps({ embedder: fakeEmbedder(true) }));

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
    const svc = createInferenceService(baseDeps({ model }));

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
    const svc = createInferenceService(baseDeps({ usage }));

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
    const svc = createInferenceService(baseDeps({ usage: throwingUsage }));

    const res = await svc.chat({ tenant: "acme", prompt: "hi", topK: 1 });
    expect(res.completion).toContain("Based on:");
  });

  it("emits a START then COMPLETE lineage run reusing a single uuid runId", async () => {
    const { emitter, calls } = recordingLineage();
    const svc = createInferenceService(baseDeps({ lineage: emitter }));

    await svc.chat({ tenant: "acme", prompt: "what is x?", topK: 3 });

    expect(calls.map((c) => c.type)).toEqual(["start", "complete"]);
    const runId = calls[0]!.args.runId;
    expect(runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(calls[1]!.args.runId).toBe(runId);
    // COMPLETE carries the retrieval-stats run facet.
    expect(calls[1]!.args.runFacets).toHaveProperty("retrievalStats");
  });

  it("records the inference with retrieval stats, cache flag and the response", async () => {
    const { recorder, records } = recordingRecorder();
    const svc = createInferenceService(baseDeps({ embedder: fakeEmbedder(true), recorder }));

    await svc.chat({ tenant: "bravo", prompt: "what is x?", topK: 3 });

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.tenant).toBe("bravo");
    expect(rec.promptChars).toBe("what is x?".length);
    expect(rec.retrievedCount).toBe(2);
    expect(rec.retrievalScoreMax).toBe(0.91);
    expect(rec.retrievalScoreMean).toBeCloseTo(0.84, 5);
    expect(rec.cacheHit).toBe(true);
    expect(rec.status).toBe("ok");
    expect(rec.response.model).toBe("mock-llm-v1");
  });

  it("emits a FAIL lineage run and rethrows when the model errors", async () => {
    const { emitter, calls } = recordingLineage();
    const failingModel: ModelClient = {
      async complete() {
        throw new Error("model-proxy 503");
      },
    };
    const svc = createInferenceService(baseDeps({ model: failingModel, lineage: emitter }));

    await expect(svc.chat({ tenant: "acme", prompt: "hi", topK: 1 })).rejects.toThrow(
      "model-proxy 503",
    );
    expect(calls.map((c) => c.type)).toEqual(["start", "fail"]);
    expect(calls[1]!.args.runId).toBe(calls[0]!.args.runId);
  });
});
