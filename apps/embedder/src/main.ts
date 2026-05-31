import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { makeCacheStore } from "./slices/cache";
import { mountEmbedSlice } from "./slices/embed/slice";

const config = loadConfig();
const cache = makeCacheStore({ backend: config.cacheBackend, redisUrl: config.redisUrl });

const app = createApp("embedder");
mountEmbedSlice(app, { cache, ttlSeconds: config.embedCacheTtlSeconds });

console.log(`[embedder] listening on :${config.port} (cache=${config.cacheBackend})`);

export default { port: config.port, fetch: app.fetch };
