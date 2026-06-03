import { type LineageOptions, resolveLineageOptions } from "@obs/lineage";
import { z } from "zod";

const EnvSchema = z.object({
  GATEWAY_PORT: z.coerce.number().int().positive().default(8080),
  REDIS_URL: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  EMBEDDER_URL: z.string().min(1).default("http://embedder:8081"),
  RETRIEVER_URL: z.string().min(1).default("http://retriever:8082"),
  MODEL_PROXY_URL: z.string().min(1).default("http://model-proxy:8083"),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  RATE_LIMIT_BACKEND: z.enum(["redis", "memory"]).optional(),
  USAGE_BACKEND: z.enum(["postgres", "noop"]).optional(),
  MARQUEZ_URL: z.string().min(1).optional(),
  LINEAGE_ENABLED: z.enum(["true", "false"]).optional(),
});

export interface Config {
  readonly port: number;
  readonly redisUrl: string | undefined;
  readonly databaseUrl: string | undefined;
  readonly embedderUrl: string;
  readonly retrieverUrl: string;
  readonly modelProxyUrl: string;
  readonly upstreamTimeoutMs: number;
  readonly rateLimitBackend: "redis" | "memory";
  readonly usageBackend: "postgres" | "noop";
  readonly lineage: LineageOptions;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const rateLimitBackend = parsed.RATE_LIMIT_BACKEND ?? (parsed.REDIS_URL ? "redis" : "memory");
  const usageBackend = parsed.USAGE_BACKEND ?? (parsed.DATABASE_URL ? "postgres" : "noop");
  return {
    port: parsed.GATEWAY_PORT,
    redisUrl: parsed.REDIS_URL,
    databaseUrl: parsed.DATABASE_URL,
    embedderUrl: parsed.EMBEDDER_URL,
    retrieverUrl: parsed.RETRIEVER_URL,
    modelProxyUrl: parsed.MODEL_PROXY_URL,
    upstreamTimeoutMs: parsed.UPSTREAM_TIMEOUT_MS,
    rateLimitBackend,
    usageBackend,
    lineage: resolveLineageOptions(env),
  };
}
