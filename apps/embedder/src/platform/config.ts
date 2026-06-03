import { type LineageOptions, resolveLineageOptions } from "@obs/lineage";
import { z } from "zod";

const EnvSchema = z.object({
  EMBEDDER_PORT: z.coerce.number().int().positive().default(8081),
  REDIS_URL: z.string().min(1).optional(),
  EMBED_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  CACHE_BACKEND: z.enum(["redis", "memory"]).optional(),
  MARQUEZ_URL: z.string().min(1).optional(),
  LINEAGE_ENABLED: z.enum(["true", "false"]).optional(),
});

export interface Config {
  readonly port: number;
  readonly redisUrl: string | undefined;
  readonly embedCacheTtlSeconds: number;
  readonly cacheBackend: "redis" | "memory";
  readonly lineage: LineageOptions;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const cacheBackend = parsed.CACHE_BACKEND ?? (parsed.REDIS_URL ? "redis" : "memory");
  return {
    port: parsed.EMBEDDER_PORT,
    redisUrl: parsed.REDIS_URL,
    embedCacheTtlSeconds: parsed.EMBED_CACHE_TTL_SECONDS,
    cacheBackend,
    lineage: resolveLineageOptions(env),
  };
}
