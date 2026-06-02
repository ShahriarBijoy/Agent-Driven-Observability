import { createMiddleware } from "hono/factory";
import { RateLimitedError } from "../../platform/errors";
import type { AppEnv } from "../../platform/http";
import { recordRateLimitRejection } from "../../platform/metrics";
import { recordForTenant } from "../auth/registry";
import type { RateLimiter } from "./ports/limiter";

/**
 * Token-bucket rate-limit middleware. Must run *after* the auth middleware so a
 * resolved tenant is on the context. Consumes one token from the tenant's
 * bucket; exhaustion raises a {@link RateLimitedError} → 429
 * `{ error: { code: "rate_limited" } }`.
 */
export function createRateLimitMiddleware(limiter: RateLimiter) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const tenant = c.get("tenant");
    const record = recordForTenant(tenant);
    // A tenant with no registry record has no defined budget; fail open.
    if (!record) {
      await next();
      return;
    }
    const result = await limiter.tryConsume(tenant, {
      capacity: record.capacity,
      refillPerSecond: record.refillPerSecond,
    });
    if (!result.allowed) {
      recordRateLimitRejection({ tenant });
      throw new RateLimitedError();
    }
    await next();
  });
}
