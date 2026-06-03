import "./platform/telemetry"; // initialises OpenTelemetry before any app code

import { createLineageEmitter } from "@obs/lineage";
import { createLogger } from "@obs/telemetry";
import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { mountAuthSlice } from "./slices/auth/slice";
import { mountRateLimitSlice } from "./slices/rate-limit/slice";
import { makeRateLimiter } from "./slices/rate-limit";
import { mountInferenceSlice } from "./slices/inference/slice";
import { makeInferenceRecorder, makeUsageWriter } from "./slices/usage-metering";

const log = createLogger("gateway");

const config = loadConfig();

const limiter = makeRateLimiter({ backend: config.rateLimitBackend, redisUrl: config.redisUrl });
const usage = makeUsageWriter({ backend: config.usageBackend, databaseUrl: config.databaseUrl });
const recorder = makeInferenceRecorder({
  backend: config.usageBackend,
  databaseUrl: config.databaseUrl,
});
const lineage = createLineageEmitter({
  url: config.lineage.url,
  enabled: config.lineage.enabled,
  logger: log,
});

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
  recorder,
  lineage,
});

log.info(`gateway listening on :${config.port}`, {
  port: config.port,
  rateLimit: config.rateLimitBackend,
  usage: config.usageBackend,
  lineage: config.lineage.enabled,
});

export default { port: config.port, fetch: app.fetch };
