import type { ChatResponse, RetrievedRef } from "@obs/contracts";
import type { EmbedderClient, ModelClient, RetrieverClient } from "./ports/clients";
import type { UsageWriter } from "../usage-metering/ports/usage-writer";

/** Max characters of a chunk body surfaced to the client as a snippet. */
const SNIPPET_CHARS = 160;

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
      const embedded = await deps.embedder.embed(input.prompt);
      const chunks = await deps.retriever.retrieve(embedded.embedding, input.topK);
      const context = chunks.map((chunk) => chunk.body);
      const completion = await deps.model.complete(input.prompt, context);

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
        console.error("[gateway] usage write failed:", reason);
      }

      const retrieved: RetrievedRef[] = chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        docId: chunk.docId,
        score: chunk.score,
        snippet: chunk.body.slice(0, SNIPPET_CHARS),
      }));

      return {
        completion: completion.completion,
        model: completion.model,
        usage: completion.usage,
        retrieved,
        cached: embedded.cached,
      };
    },
  };
}
