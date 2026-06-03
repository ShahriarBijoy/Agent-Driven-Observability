import "./platform/telemetry"; // initialises OpenTelemetry before any app code

import { createLineageEmitter } from "@obs/lineage";
import { createLogger } from "@obs/telemetry";
import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { makeCacheStore } from "./slices/cache";
import { mountEmbedSlice } from "./slices/embed/slice";

const log = createLogger("embedder");

const config = loadConfig();
const cache = makeCacheStore({ backend: config.cacheBackend, redisUrl: config.redisUrl });
const lineage = createLineageEmitter({
  url: config.lineage.url,
  enabled: config.lineage.enabled,
  logger: log,
});

const app = createApp("embedder");
mountEmbedSlice(app, { cache, ttlSeconds: config.embedCacheTtlSeconds, lineage });

console.log(`[embedder] listening on :${config.port} (cache=${config.cacheBackend})`);

export default { port: config.port, fetch: app.fetch };
