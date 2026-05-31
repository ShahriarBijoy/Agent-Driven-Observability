import type { RetrievedChunk } from "@obs/contracts";

/** A raw row as returned by the pgvector similarity query. */
export interface ScoredRow {
  chunkId: string;
  docId: string;
  body: string;
  score: number;
}

/**
 * Map raw DB rows → {@link RetrievedChunk}s, sorted by score descending and
 * clamped to `topK`. Pure: no DB, no I/O — safe to unit test directly.
 *
 * The pgvector query already orders + limits, but we re-sort and re-clamp here
 * so ranking is deterministic and correct regardless of the adapter's behavior
 * (and so the in-memory test adapter need not pre-sort).
 */
export function rankChunks(rows: readonly ScoredRow[], topK: number): RetrievedChunk[] {
  const limit = Math.max(0, Math.trunc(topK));
  return rows
    .map(
      (row): RetrievedChunk => ({
        chunkId: row.chunkId,
        docId: row.docId,
        body: row.body,
        score: row.score,
      }),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
