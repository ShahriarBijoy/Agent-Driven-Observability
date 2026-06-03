import { randomUUID } from "node:crypto";

/** Mint a fresh run id. OpenLineage requires `runId` to be a UUID. */
export function newRunId(): string {
  return randomUUID();
}
