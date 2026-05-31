import { z } from "zod";

/**
 * Env schema for the load generator. Mirrors the embedder's platform/config.ts
 * idiom: a zod env schema parsed into a typed, camelCase, readonly Config.
 */
const EnvSchema = z.object({
  GATEWAY_URL: z.string().min(1).default("http://localhost:8080"),
  TARGET_QPS: z.coerce.number().positive().default(120),
  DURATION_SECONDS: z.coerce.number().positive().default(300),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  CONCURRENCY: z.coerce.number().int().positive().default(64),
});

export interface Config {
  readonly gatewayUrl: string;
  readonly targetQps: number;
  readonly durationSeconds: number;
  readonly requestTimeoutMs: number;
  readonly concurrency: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    gatewayUrl: parsed.GATEWAY_URL.replace(/\/+$/, ""),
    targetQps: parsed.TARGET_QPS,
    durationSeconds: parsed.DURATION_SECONDS,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    concurrency: parsed.CONCURRENCY,
  };
}
