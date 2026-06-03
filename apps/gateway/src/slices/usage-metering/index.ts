import { createDb } from "./db/client";
import type { InferenceRecorder } from "./ports/inference-recorder";
import type { UsageWriter } from "./ports/usage-writer";
import { createNoopInferenceRecorder } from "./adapters/noop-inference-recorder";
import { createNoopUsageWriter } from "./adapters/noop-usage-writer";
import { createPostgresInferenceRecorder } from "./adapters/postgres-inference-recorder";
import { createPostgresUsageWriter } from "./adapters/postgres-usage-writer";

export type { UsageWriter, UsageRecord } from "./ports/usage-writer";
export type { InferenceRecorder, InferenceRecord } from "./ports/inference-recorder";
export { createNoopUsageWriter } from "./adapters/noop-usage-writer";
export { createNoopInferenceRecorder } from "./adapters/noop-inference-recorder";

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

export function makeInferenceRecorder(opts: UsageWriterOptions): InferenceRecorder {
  if (opts.backend === "postgres") {
    if (!opts.databaseUrl) {
      throw new Error("DATABASE_URL is required when USAGE_BACKEND=postgres");
    }
    return createPostgresInferenceRecorder(createDb(opts.databaseUrl));
  }
  return createNoopInferenceRecorder();
}
