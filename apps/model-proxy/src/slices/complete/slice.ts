import type { OpenAPIHono } from "@hono/zod-openapi";
import type { FaultConfig } from "../../platform/config";
import type { Rng } from "./faults";
import { createCompleteService } from "./service";
import { registerCompleteRoute } from "./handlers/complete";

export interface CompleteSliceDeps {
  faults: FaultConfig;
  /** Resolve the effective (chaos-overridden) fault config per request. */
  resolveFaults?: () => FaultConfig;
  rng?: Rng;
  now?: () => number;
}

/** Mount point for the complete feature — wires the service and registers routes. */
export function mountCompleteSlice(app: OpenAPIHono, deps: CompleteSliceDeps): void {
  const service = createCompleteService(deps);
  registerCompleteRoute(app, service);
}
