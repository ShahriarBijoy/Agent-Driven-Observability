import type { Tenant } from "@obs/domain";
import type { BucketConfig, LimitResult, RateLimiter } from "../ports/limiter";

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/**
 * In-process token-bucket limiter (same semantics as the Redis Lua adapter).
 * Used in tests and when no Redis is configured. `now` is injectable so tests
 * can advance time deterministically.
 */
export function createMemoryLimiter(now: () => number = () => Date.now()): RateLimiter {
  const buckets = new Map<string, BucketState>();

  return {
    async tryConsume(tenant: Tenant, config: BucketConfig): Promise<LimitResult> {
      const key = `rl:${tenant}`;
      const nowMs = now();
      const existing = buckets.get(key);
      const state: BucketState = existing ?? { tokens: config.capacity, lastRefillMs: nowMs };

      const elapsedSec = Math.max(0, (nowMs - state.lastRefillMs) / 1000);
      const refilled = Math.min(
        config.capacity,
        state.tokens + elapsedSec * config.refillPerSecond,
      );
      state.lastRefillMs = nowMs;

      let allowed = false;
      let tokens = refilled;
      if (tokens >= 1) {
        tokens -= 1;
        allowed = true;
      }
      state.tokens = tokens;
      buckets.set(key, state);

      return { allowed, remaining: Math.floor(tokens) };
    },
    async close() {
      buckets.clear();
    },
  };
}
