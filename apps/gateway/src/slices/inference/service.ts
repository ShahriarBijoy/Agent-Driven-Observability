import { createHash } from "node:crypto";
import { createLogger, withSpan } from "@obs/telemetry";
import type { ChatResponse, RetrievedRef } from "@obs/contracts";
import {
  recordCacheHit,
  recordRetrievalRelevance,
  recordTokensIn,
  recordTokensOut,
} from "../../platform/metrics";
import type { EmbedderClient, ModelClient, RetrieverClient } from "./ports/clients";
import type { UsageWriter } from "../usage-metering/ports/usage-writer";

/** Max characters of a chunk body surfaced to the client as a snippet. */
const SNIPPET_CHARS = 160;

const log = createLogger("gateway");

/** Stable sha-256 hex digest of the prompt, for low-cardinality span attribution. */
function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

export interface InferenceServiceDeps {
  embedder: EmbedderClient;
  retriever: RetrieverClient;
  model: ModelClient;
  usage: UsageWriter;
}

export interface ChatInput {
  readonly tenant: string;
  readonly prompt: string;
  readonly topK: number;
}

export interface InferenceService {
  chat(input: ChatInput): Promise<ChatResponse>;
}

/**
 * Inference orchestration (the RAG flow):
 *   1. embed the prompt          → embedding, cached
 *   2. retrieve(embedding, topK) → chunks
 *   3. complete(prompt, context = chunk bodies) → completion
 *   4. write usage (best-effort; a failure must not fail the request)
 *   5. respond with `retrieved` mapped to RetrievedRef (snippet = first 160
 *      chars) and `cached` = the embedder's cached flag.
 */
export function createInferenceService(deps: InferenceServiceDeps): InferenceService {
  return {
    async chat(input: ChatInput): Promise<ChatResponse> {
      return withSpan("rag.chat", async () => {
        // 1. embed + retrieve → chunks
        const { embedded, chunks } = await withSpan("rag.retrieve", async (span) => {
          span.setAttributes({
            tenant: input.tenant,
            "prompt.hash": hashPrompt(input.prompt),
            "rag.top_k": input.topK,
          });
          const result = await deps.embedder.embed(input.prompt);
          const retrieved = await deps.retriever.retrieve(result.embedding, input.topK);
          span.setAttribute(
            "rag.retrieved_doc_ids",
            retrieved.map((chunk) => chunk.docId),
          );
          return { embedded: result, chunks: retrieved };
        });

        // Relevance + cache metrics from the retrieval outcome.
        for (const chunk of chunks) recordRetrievalRelevance(chunk.score);
        recordCacheHit(embedded.cached);

        // 2. build the context from chunk bodies
        const context = await withSpan("rag.augment", () => chunks.map((chunk) => chunk.body));

        // 3. complete(prompt, context) → completion
        const completion = await withSpan("rag.generate", async (span) => {
          const result = await deps.model.complete(input.prompt, context);
          span.setAttribute("gen.model", result.model);
          return result;
        });

        recordTokensIn(completion.usage.promptTokens, {
          tenant: input.tenant,
          model: completion.model,
        });
        recordTokensOut(completion.usage.completionTokens, {
          tenant: input.tenant,
          model: completion.model,
        });

        // Best-effort usage write — a metering failure must never fail the chat.
        try {
          await deps.usage.write({
            tenant: input.tenant,
            promptTokens: completion.usage.promptTokens,
            completionTokens: completion.usage.completionTokens,
            model: completion.model,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          log.error("usage write failed", { reason });
        }

        const retrieved: RetrievedRef[] = chunks.map((chunk) => ({
          chunkId: chunk.chunkId,
          docId: chunk.docId,
          score: chunk.score,
          snippet: chunk.body.slice(0, SNIPPET_CHARS),
        }));

        log.info("chat completed", {
          tenant: input.tenant,
          topK: input.topK,
          model: completion.model,
          cached: embedded.cached,
          retrievedCount: retrieved.length,
        });

        return {
          completion: completion.completion,
          model: completion.model,
          usage: completion.usage,
          retrieved,
          cached: embedded.cached,
        };
      });
    },
  };
}
