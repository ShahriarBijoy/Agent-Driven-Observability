import { pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

export const chunks = pgTable("chunks", {
  id: text("id").primaryKey(),
  docId: text("doc_id").notNull(),
  body: text("body").notNull(),
  embedding: vector("embedding", { dimensions: 384 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
