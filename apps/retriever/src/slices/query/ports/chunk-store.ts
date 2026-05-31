import type { ScoredRow } from "../../rank/rank";

/**
 * Port: a similarity search over the chunk corpus. Adapters: pgvector (prod),
 * in-memory (tests). Returns rows already scored by cosine similarity; ranking
 * + clamping is applied by the service via the pure {@link rankChunks} helper.
 */
export interface ChunkStore {
  search(embedding: number[], topK: number): Promise<ScoredRow[]>;
}
