import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
