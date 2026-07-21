import { createHash } from "node:crypto";
import {
  DS_CACHE_EMBEDDINGS,
  DS_COMPLETIONS_RECENT,
  DS_PROMPTS_RECENT,
  DS_VECTOR_STORE_CHUNKS,
  JOB_INFERENCE,
  type LineageEmitter,
  newRunId,
  PRODUCER,
  retrievalStatsFacet,
} from "@obs/lineage";
import { createLogger, withSpan } from "@obs/telemetry";
import type { ChatResponse, RetrievedRef } from "@obs/contracts";
import { runWithParent } from "../../platform/lineage-context";
import {
  recordCacheHit,
  recordRetrievalRelevance,
  recordRetrievalTopScore,
  recordTokensIn,
  recordTokensOut,
} from "../../platform/metrics";
import type { EmbedderClient, ModelClient, RetrieverClient } from "./ports/clients";
import type { InferenceRecorder } from "../usage-metering/ports/inference-recorder";
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
  recorder: InferenceRecorder;
  lineage: LineageEmitter;
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
 *   4. write usage + record the inference (best-effort; failures never fail the request)
 *   5. respond with `retrieved` mapped to RetrievedRef (snippet = first 160 chars)
 *
 * Each call is one OpenLineage run of the `rag.inference` job: a START before
 * the work, a COMPLETE (with retrieval-stats / model / tenant facets) on success,
 * or a FAIL on error. The embed + retrieve calls run with the run bound as the
 * lineage parent so the embedder/retriever can link their sub-runs to it.
 */
export function createInferenceService(deps: InferenceServiceDeps): InferenceService {
  return {
    async chat(input: ChatInput): Promise<ChatResponse> {
      const runId = newRunId();
      return withSpan("rag.chat", async (chatSpan) => {
        chatSpan.setAttribute("lineage.run_id", runId);
        await deps.lineage.start({
          runId,
          job: JOB_INFERENCE,
          inputs: [DS_VECTOR_STORE_CHUNKS, DS_CACHE_EMBEDDINGS],
        });

        try {
          const parent = {
            runId,
            jobNamespace: JOB_INFERENCE.namespace,
            jobName: JOB_INFERENCE.name,
          };

          // 1. embed + retrieve → chunks (bound to the lineage parent so the
          //    embedder/retriever sub-runs link back to this run).
          const { embedded, chunks } = await runWithParent(parent, () =>
            withSpan("rag.retrieve", async (span) => {
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
            }),
          );

          // Relevance + cache metrics from the retrieval outcome. The top-1
          // (best) score feeds the RAG-quality SLO; per-chunk scores feed the
          // relevance histogram.
          const scores = chunks.map((chunk) => chunk.score);
          for (const score of scores) recordRetrievalRelevance(score);
          if (scores.length > 0) recordRetrievalTopScore(Math.max(...scores));
          recordCacheHit(embedded.cached);

          // 2. build the context from chunk bodies
          const context = await withSpan("rag.augment", () => chunks.map((chunk) => chunk.body));

          // 3. complete(prompt, context) → completion (outside the lineage parent
          //    context — the model-proxy is not a lineage sub-run).
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

          const retrieved: RetrievedRef[] = chunks.map((chunk) => ({
            chunkId: chunk.chunkId,
            docId: chunk.docId,
            score: chunk.score,
            snippet: chunk.body.slice(0, SNIPPET_CHARS),
          }));

          const response: ChatResponse = {
            completion: completion.completion,
            model: completion.model,
            usage: completion.usage,
            retrieved,
            cached: embedded.cached,
          };

          const stats = retrievalStatsFacet(scores);

          // Best-effort persistence — neither metering nor recording may fail the chat.
          try {
            await deps.usage.write({
              tenant: input.tenant,
              promptTokens: completion.usage.promptTokens,
              completionTokens: completion.usage.completionTokens,
              model: completion.model,
            });
          } catch (err) {
            log.error("usage write failed", {
              reason: err instanceof Error ? err.message : String(err),
            });
          }

          try {
            await deps.recorder.record({
              runId,
              tenant: input.tenant,
              model: completion.model,
              promptChars: input.prompt.length,
              promptTokens: completion.usage.promptTokens,
              completionTokens: completion.usage.completionTokens,
              retrievedCount: retrieved.length,
              retrievalScoreMean: stats.mean,
              retrievalScoreMax: stats.max,
              cacheHit: embedded.cached,
              status: "ok",
              response,
            });
          } catch (err) {
            log.error("inference record failed", {
              reason: err instanceof Error ? err.message : String(err),
            });
          }

          await deps.lineage.complete({
            runId,
            job: JOB_INFERENCE,
            outputs: [DS_PROMPTS_RECENT, DS_COMPLETIONS_RECENT],
            runFacets: {
              retrievalStats: stats,
              inference: {
                _producer: PRODUCER,
                _schemaURL: `${PRODUCER}#/$defs/InferenceRunFacet`,
                model: completion.model,
                tenant: input.tenant,
              },
            },
          });

          log.info("chat completed", {
            tenant: input.tenant,
            topK: input.topK,
            model: completion.model,
            cached: embedded.cached,
            retrievedCount: retrieved.length,
          });

          return response;
        } catch (err) {
          await deps.lineage.fail({ runId, job: JOB_INFERENCE, error: err });
          throw err;
        }
      });
    },
  };
}
