import type { OpenAPIHono } from "@hono/zod-openapi";
import type { CacheStore } from "../cache/ports/cache-store";
import { createEmbedService } from "./service";
import { registerEmbedRoute } from "./handlers/embed";

export interface EmbedSliceDeps {
  cache: CacheStore;
  ttlSeconds: number;
}

/** Mount point for the embed feature — wires the service and registers routes. */
export function mountEmbedSlice(app: OpenAPIHono, deps: EmbedSliceDeps): void {
  const service = createEmbedService(deps);
  registerEmbedRoute(app, service);
}
