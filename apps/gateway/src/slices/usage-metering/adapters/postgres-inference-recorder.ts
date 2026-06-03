import type { Database } from "../db/client";
import { inferences } from "../db/schema";
import type { InferenceRecord, InferenceRecorder } from "../ports/inference-recorder";

/**
 * Drizzle/postgres inference recorder. Inserts one row per successful chat into
 * the `inferences` table (the table is provisioned by the postgres init script
 * and ensured by the dq-runner at startup). Errors are logged and swallowed —
 * recording is best-effort and must never fail the originating chat request.
 */
export function createPostgresInferenceRecorder(db: Database): InferenceRecorder {
  return {
    async record(record: InferenceRecord): Promise<void> {
      try {
        await db.insert(inferences).values({
          runId: record.runId,
          tenant: record.tenant,
          model: record.model,
          promptChars: record.promptChars,
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          retrievedCount: record.retrievedCount,
          retrievalScoreMean: record.retrievalScoreMean,
          retrievalScoreMax: record.retrievalScoreMax,
          cacheHit: record.cacheHit,
          status: record.status,
          response: record.response,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[gateway] inference record failed:", reason);
      }
    },
    async close() {
      // postgres.js connection lifecycle is owned by the process; nothing to do.
    },
  };
}
