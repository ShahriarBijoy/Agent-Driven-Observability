import type { OpenAPIHono } from "@hono/zod-openapi";
import { registerRetrieveRoute } from "./handlers/retrieve";
import type { ChunkStore } from "./ports/chunk-store";
import { createRetrieveService } from "./service";

export interface QuerySliceDeps {
  store: ChunkStore;
}

/** Mount point for the retrieve feature — wires the service and registers routes. */
export function mountQuerySlice(app: OpenAPIHono, deps: QuerySliceDeps): void {
  const service = createRetrieveService(deps);
  registerRetrieveRoute(app, service);
}
