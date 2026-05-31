import type { UsageWriter } from "../ports/usage-writer";

/** No-op usage writer used in tests and when no DATABASE_URL is configured. */
export function createNoopUsageWriter(): UsageWriter {
  return {
    async write() {
      // intentionally does nothing
    },
    async close() {
      // nothing to close
    },
  };
}
