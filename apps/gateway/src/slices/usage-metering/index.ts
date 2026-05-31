import { createDb } from "./db/client";
import type { UsageWriter } from "./ports/usage-writer";
import { createNoopUsageWriter } from "./adapters/noop-usage-writer";
import { createPostgresUsageWriter } from "./adapters/postgres-usage-writer";

export type { UsageWriter, UsageRecord } from "./ports/usage-writer";
export { createNoopUsageWriter } from "./adapters/noop-usage-writer";

export interface UsageWriterOptions {
  backend: "postgres" | "noop";
  databaseUrl?: string | undefined;
}

export function makeUsageWriter(opts: UsageWriterOptions): UsageWriter {
  if (opts.backend === "postgres") {
    if (!opts.databaseUrl) {
      throw new Error("DATABASE_URL is required when USAGE_BACKEND=postgres");
    }
    return createPostgresUsageWriter(createDb(opts.databaseUrl));
  }
  return createNoopUsageWriter();
}
