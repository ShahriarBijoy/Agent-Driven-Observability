import type { CacheStore } from "./ports/cache-store";
import { createMemoryCache } from "./adapters/memory-cache";
import { createRedisCache } from "./adapters/redis-cache";

export type { CacheStore } from "./ports/cache-store";
export { createMemoryCache } from "./adapters/memory-cache";

export interface CacheOptions {
  backend: "redis" | "memory";
  redisUrl?: string | undefined;
}

export function makeCacheStore(opts: CacheOptions): CacheStore {
  if (opts.backend === "redis") {
    if (!opts.redisUrl) {
      throw new Error("REDIS_URL is required when CACHE_BACKEND=redis");
    }
    return createRedisCache(opts.redisUrl);
  }
  return createMemoryCache();
}
