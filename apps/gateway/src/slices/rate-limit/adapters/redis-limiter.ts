import { Redis } from "ioredis";
import type { Tenant } from "@obs/domain";
import type { BucketConfig, LimitResult, RateLimiter } from "../ports/limiter";

/**
 * Atomic token-bucket Lua script.
 *
 * KEYS[1] = bucket key (`rl:<tenant>`)
 * ARGV    = capacity, refillPerSecond, nowMs
 *
 * Reads the stored `tokens`/`ts`, refills by elapsed time, consumes one token
 * if available, persists the new state with a TTL, and returns
 * `{ allowed, remaining }`. Running it server-side keeps read-modify-write
 * atomic across concurrent gateway replicas.
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsed = (now - ts) / 1000.0
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
local ttl = 60
if refill > 0 then
  ttl = math.ceil(capacity / refill) + 1
end
redis.call('EXPIRE', key, ttl)

return { allowed, math.floor(tokens) }
`;

/**
 * Redis-backed token bucket. State lives in a hash at `rl:<tenant>`; the
 * read-modify-write runs inside an atomic Lua script via `EVAL`.
 */
export function createRedisLimiter(url: string): RateLimiter {
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  redis.on("error", (err) => {
    console.error("[gateway] redis error:", err.message);
  });

  return {
    async tryConsume(tenant: Tenant, config: BucketConfig): Promise<LimitResult> {
      const key = `rl:${tenant}`;
      const raw = (await redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        key,
        String(config.capacity),
        String(config.refillPerSecond),
        String(Date.now()),
      )) as [number, number];
      const allowed = raw[0] === 1;
      const remaining = raw[1] ?? 0;
      return { allowed, remaining };
    },
    async close() {
      await redis.quit();
    },
  };
}
