import type { Tenant } from "@obs/domain";

/** Parameters of a token bucket: max burst capacity and steady refill rate. */
export interface BucketConfig {
  readonly capacity: number;
  readonly refillPerSecond: number;
}

/** Outcome of consuming one token from a tenant's bucket. */
export interface LimitResult {
  /** Whether the request is allowed (a token was available). */
  readonly allowed: boolean;
  /** Tokens remaining after this attempt (floored at 0). */
  readonly remaining: number;
}

/**
 * Port: a per-tenant token-bucket rate limiter. Adapters: an atomic Redis Lua
 * script (production) and an in-process bucket (tests). Each `tryConsume`
 * attempts to take one token for the tenant given its bucket config.
 */
export interface RateLimiter {
  tryConsume(tenant: Tenant, config: BucketConfig): Promise<LimitResult>;
  close(): Promise<void>;
}
