import { createHash } from "node:crypto";
import { hashEmbedding } from "@obs/domain";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../db/client";
import { chunks as chunksTable } from "../db/schema";
import { chunkText, generateFallbackCorpus, stripGutenberg, type Chunk } from "./chunk";

const DEFAULT_CORPUS_URL = "https://www.gutenberg.org/cache/epub/1342/pg1342.txt";
const DOC_ID = "pg1342";
const INSERT_BATCH = 200;

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://lab:lab@localhost:5432/observability_lab"),
  SEED_CORPUS_URL: z.string().min(1).default(DEFAULT_CORPUS_URL),
  SEED_CORPUS_SHA256: z.string().min(1).optional(),
  SEED_CHUNK_COUNT: z.coerce.number().int().positive().default(1000),
});

type SeedConfig = z.infer<typeof EnvSchema>;

function loadSeedConfig(env: Record<string, string | undefined> = process.env): SeedConfig {
  return EnvSchema.parse(env);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Build the corpus chunks: download the pinned text, verify the optional
 * checksum, strip the Gutenberg header/footer, and chunk it. On ANY failure
 * (network, checksum mismatch, empty body) log a warning and fall back to a
 * deterministic generated corpus so the lab never hard-fails offline.
 */
async function buildChunks(config: SeedConfig): Promise<Chunk[]> {
  try {
    console.log(`[seed] downloading corpus from ${config.SEED_CORPUS_URL}`);
    const res = await fetch(config.SEED_CORPUS_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      throw new Error(`download failed: HTTP ${res.status}`);
    }
    const raw = await res.text();

    if (config.SEED_CORPUS_SHA256) {
      const actual = sha256Hex(raw);
      if (actual !== config.SEED_CORPUS_SHA256.toLowerCase()) {
        throw new Error(`checksum mismatch: expected ${config.SEED_CORPUS_SHA256}, got ${actual}`);
      }
      console.log("[seed] checksum verified");
    }

    const body = stripGutenberg(raw);
    const chunks = chunkText(body, DOC_ID, config.SEED_CHUNK_COUNT);
    if (chunks.length === 0) {
      throw new Error("stripped corpus produced zero chunks");
    }
    console.log(`[seed] downloaded corpus → ${chunks.length} chunks`);
    return chunks;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[seed] WARNING: corpus download failed (${message}); using generated fallback`);
    const fallback = generateFallbackCorpus(config.SEED_CHUNK_COUNT);
    const chunks = chunkText(fallback, "generated", config.SEED_CHUNK_COUNT);
    console.log(`[seed] generated fallback corpus → ${chunks.length} chunks`);
    return chunks;
  }
}

async function main(): Promise<void> {
  const config = loadSeedConfig();
  const chunks = await buildChunks(config);

  const handle = createDb(config.DATABASE_URL);
  const { db } = handle;
  try {
    const rows = chunks.map((chunk) => ({
      id: chunk.id,
      docId: chunk.docId,
      body: chunk.body,
      embedding: hashEmbedding(chunk.body),
    }));

    let inserted = 0;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH);
      await db.insert(chunksTable).values(batch).onConflictDoNothing();
      inserted += batch.length;
      console.log(`[seed] upserted ${inserted}/${rows.length} chunks`);
    }

    // IVFFlat index is built AFTER load so it trains on real vectors (ADR-002 §1).
    console.log("[seed] building ivfflat index (vector_cosine_ops, lists=100)");
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS chunks_embedding_ivfflat ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
    );
    await db.execute(sql`ANALYZE chunks`);

    const countResult = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM chunks`,
    );
    const total = countResult.at(0)?.count ?? 0;
    console.log(`[seed] done — chunks table now holds ${total} rows`);
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
