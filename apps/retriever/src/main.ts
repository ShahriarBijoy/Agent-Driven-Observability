import "./platform/telemetry"; // initialises OpenTelemetry before any app code

import { createLineageEmitter } from "@obs/lineage";
import { createLogger } from "@obs/telemetry";
import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { createDb } from "./db/client";
import { mountChaosSlice } from "./slices/chaos/slice";
import { createPgvectorStore } from "./slices/query/adapters/pgvector-store";
import { mountQuerySlice } from "./slices/query/slice";

const log = createLogger("retriever");

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
const store = createPgvectorStore(db);
const lineage = createLineageEmitter({
  url: config.lineage.url,
  enabled: config.lineage.enabled,
  logger: log,
});

const app = createApp("retriever");
mountQuerySlice(app, { store, lineage });

// Dev/lab-only runtime chaos control plane (ADR-005). Set CHAOS_CONTROL_ENABLED
// =false to harden the service (drops the /admin/chaos routes entirely).
const chaosEnabled = process.env["CHAOS_CONTROL_ENABLED"] !== "false";
if (chaosEnabled) mountChaosSlice(app);

console.log(
  `[retriever] listening on :${config.port} (chaos-control=${chaosEnabled ? "on" : "off"})`,
);

export default { port: config.port, fetch: app.fetch };
