import "./platform/telemetry"; // initialises OpenTelemetry before any app code

import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { createDb } from "./db/client";
import { createPgvectorStore } from "./slices/query/adapters/pgvector-store";
import { mountQuerySlice } from "./slices/query/slice";

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
const store = createPgvectorStore(db);

const app = createApp("retriever");
mountQuerySlice(app, { store });

console.log(`[retriever] listening on :${config.port}`);

export default { port: config.port, fetch: app.fetch };
