import { cosineSimilarity } from "@obs/domain";
import type { ScoredRow } from "../../rank/rank";
import type { ChunkStore } from "../ports/chunk-store";

/** A seeded chunk for the in-memory store. */
export interface MemoryChunk {
  chunkId: string;
  docId: string;
  body: string;
  embedding: number[];
}

/**
 * In-process similarity search. Scores every seeded chunk with the domain's
 * cosine similarity. Used in tests so we never need a live DB; ordering +
 * clamping is left to the service's {@link rankChunks} step.
 */
export function createMemoryStore(seed: readonly MemoryChunk[] = []): ChunkStore {
  const corpus = [...seed];
  return {
    async search(embedding) {
      return corpus.map(
        (chunk): ScoredRow => ({
          chunkId: chunk.chunkId,
          docId: chunk.docId,
          body: chunk.body,
          score: cosineSimilarity(embedding, chunk.embedding),
        }),
      );
    },
  };
}
