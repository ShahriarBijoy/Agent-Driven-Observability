import { cosineDistance, desc, sql } from "drizzle-orm";
import type { Db } from "../../../db/client";
import { chunks } from "../../../db/schema";
import type { ScoredRow } from "../../rank/rank";
import type { ChunkStore } from "../ports/chunk-store";

/**
 * pgvector-backed similarity search. Cosine similarity = `1 - cosineDistance`,
 * ordered by similarity descending and limited to `topK` — exactly the query in
 * the build spec (ADR-002 §6.3).
 */
export function createPgvectorStore(db: Db): ChunkStore {
  return {
    async search(embedding, topK) {
      const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, embedding)})`;
      const rows = await db
        .select({
          chunkId: chunks.id,
          docId: chunks.docId,
          body: chunks.body,
          score: similarity,
        })
        .from(chunks)
        .orderBy(desc(similarity))
        .limit(topK);
      return rows satisfies ScoredRow[];
    },
  };
}
