import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** One row per successful chat — the raw material for Phase-2 usage analytics. */
export const usageEvents = pgTable("usage_events", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  tenant: text("tenant").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UsageEventInsert = typeof usageEvents.$inferInsert;

/**
 * One row per successful inference — the materialisation of the OpenLineage
 * `prompts.recent` / `completions.recent` datasets, and the data source the
 * Phase-3 dq-runner reads for freshness, volume, distribution and schema checks.
 */
export const inferences = pgTable("inferences", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  runId: uuid("run_id").notNull(),
  tenant: text("tenant").notNull(),
  model: text("model").notNull(),
  promptChars: integer("prompt_chars").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  retrievedCount: integer("retrieved_count").notNull(),
  retrievalScoreMean: doublePrecision("retrieval_score_mean"),
  retrievalScoreMax: doublePrecision("retrieval_score_max"),
  cacheHit: boolean("cache_hit").notNull(),
  status: text("status").notNull(),
  response: jsonb("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InferenceInsert = typeof inferences.$inferInsert;
