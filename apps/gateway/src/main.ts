import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { mountAuthSlice } from "./slices/auth/slice";
import { mountRateLimitSlice } from "./slices/rate-limit/slice";
import { makeRateLimiter } from "./slices/rate-limit";
import { mountInferenceSlice } from "./slices/inference/slice";
import { makeUsageWriter } from "./slices/usage-metering";

const config = loadConfig();

const limiter = makeRateLimiter({ backend: config.rateLimitBackend, redisUrl: config.redisUrl });
const usage = makeUsageWriter({ backend: config.usageBackend, databaseUrl: config.databaseUrl });

const app = createApp("gateway");

// Middleware runs in registration order: authenticate, then rate-limit, on /v1/*.
mountAuthSlice(app);
mountRateLimitSlice(app, { limiter });

mountInferenceSlice(app, {
  embedderUrl: config.embedderUrl,
  retrieverUrl: config.retrieverUrl,
  modelProxyUrl: config.modelProxyUrl,
  upstreamTimeoutMs: config.upstreamTimeoutMs,
  usage,
});

console.log(
  `[gateway] listening on :${config.port} ` +
    `(rateLimit=${config.rateLimitBackend}, usage=${config.usageBackend})`,
);

export default { port: config.port, fetch: app.fetch };
