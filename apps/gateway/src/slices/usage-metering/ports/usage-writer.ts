/** A single usage record to persist after a successful chat (id/createdAt omitted). */
export interface UsageRecord {
  readonly tenant: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string;
}

/**
 * Port: persists usage events. Adapters: Drizzle/postgres (production) and a
 * no-op (when no DATABASE_URL). A write failure must never fail the request, so
 * `write` is expected to swallow and log its own errors.
 */
export interface UsageWriter {
  write(record: UsageRecord): Promise<void>;
  close(): Promise<void>;
}
