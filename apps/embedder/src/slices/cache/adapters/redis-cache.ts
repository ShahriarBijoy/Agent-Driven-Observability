import { Redis } from "ioredis";
import type { CacheStore } from "../ports/cache-store";

/** Redis-backed cache. Keys are written with `SET key value EX ttl`. */
export function createRedisCache(url: string): CacheStore {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  // Don't crash the process on transient connection errors; log and continue.
  redis.on("error", (err) => {
    console.error("[embedder] redis error:", err.message);
  });

  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, "EX", ttlSeconds);
    },
    async close() {
      await redis.quit();
    },
  };
}
