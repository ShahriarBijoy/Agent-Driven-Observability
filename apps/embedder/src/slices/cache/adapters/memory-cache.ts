import type { CacheStore } from "../ports/cache-store";

interface Entry {
  value: string;
  expiresAt: number;
}

/** In-process cache with TTL. Used in tests and when REDIS_URL is unset. */
export function createMemoryCache(): CacheStore {
  const store = new Map<string, Entry>();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async close() {
      store.clear();
    },
  };
}
