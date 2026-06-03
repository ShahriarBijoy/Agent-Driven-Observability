// The lab's lineage taxonomy: the jobs and datasets that make up the RAG
// pipeline, as seen by OpenLineage. See docs/adr/004-data-observability.md for
// the rationale behind these names.

import { DEFAULT_NAMESPACE } from "./spec";
import type { Dataset, JobRef } from "./types";

function job(name: string): JobRef {
  return { namespace: DEFAULT_NAMESPACE, name };
}

function dataset(name: string): Dataset {
  return { namespace: DEFAULT_NAMESPACE, name };
}

/** Parent job — one run per `/v1/chat` call on the gateway. */
export const JOB_INFERENCE = job("rag.inference");
/** Child job — the embedder embedding a prompt. */
export const JOB_EMBED = job("rag.embed");
/** Child job — the retriever fetching top-k chunks. */
export const JOB_RETRIEVE = job("rag.retrieve");

/** The pgvector corpus the retriever searches. */
export const DS_VECTOR_STORE_CHUNKS = dataset("vector_store.chunks");
/** The Redis embedding cache. */
export const DS_CACHE_EMBEDDINGS = dataset("cache.embeddings");
/** Recent prompts (materialised in the `inferences` table). */
export const DS_PROMPTS_RECENT = dataset("prompts.recent");
/** Recent completions (materialised in the `inferences` table). */
export const DS_COMPLETIONS_RECENT = dataset("completions.recent");
/** The inbound prompt as seen by the embedder. */
export const DS_PROMPTS_INCOMING = dataset("prompts.incoming");
/** The retriever's ranked result set. */
export const DS_RETRIEVAL_RESULTS = dataset("retrieval.results");
