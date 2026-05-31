import type { GatewayApp } from "../../platform/http";
import { authMiddleware } from "./middleware";

export { authMiddleware } from "./middleware";
export { parseBearer } from "./middleware";

/**
 * Mount point for the auth feature. Applies the bearer-token middleware to the
 * given path prefix so downstream handlers can read the resolved tenant.
 */
export function mountAuthSlice(app: GatewayApp, pathPrefix = "/v1/*"): void {
  app.use(pathPrefix, authMiddleware);
}
