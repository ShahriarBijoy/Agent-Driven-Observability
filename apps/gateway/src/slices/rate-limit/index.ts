import type { RateLimiter } from "./ports/limiter";
import { createMemoryLimiter } from "./adapters/memory-limiter";
import { createRedisLimiter } from "./adapters/redis-limiter";

export type { RateLimiter, BucketConfig, LimitResult } from "./ports/limiter";
export { createMemoryLimiter } from "./adapters/memory-limiter";

export interface RateLimiterOptions {
  backend: "redis" | "memory";
  redisUrl?: string | undefined;
}

export function makeRateLimiter(opts: RateLimiterOptions): RateLimiter {
  if (opts.backend === "redis") {
    if (!opts.redisUrl) {
      throw new Error("REDIS_URL is required when RATE_LIMIT_BACKEND=redis");
    }
    return createRedisLimiter(opts.redisUrl);
  }
  return createMemoryLimiter();
}
