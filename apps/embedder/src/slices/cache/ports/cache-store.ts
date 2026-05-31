/** Port: a minimal string cache with TTL. Adapters: redis, in-memory. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  close(): Promise<void>;
}
