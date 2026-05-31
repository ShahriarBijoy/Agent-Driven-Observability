import type { GatewayApp } from "../../platform/http";
import type { RateLimiter } from "./ports/limiter";
import { createRateLimitMiddleware } from "./middleware";

export { createRateLimitMiddleware } from "./middleware";

export interface RateLimitSliceDeps {
  limiter: RateLimiter;
}

/**
 * Mount point for the rate-limit feature. Applies the token-bucket middleware
 * to the given path prefix (run after auth so the tenant is resolved).
 */
export function mountRateLimitSlice(
  app: GatewayApp,
  deps: RateLimitSliceDeps,
  pathPrefix = "/v1/*",
): void {
  app.use(pathPrefix, createRateLimitMiddleware(deps.limiter));
}
