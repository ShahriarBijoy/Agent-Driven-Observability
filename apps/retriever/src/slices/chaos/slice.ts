import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { clearChaos, getChaos, setChaos } from "./state";

const ChaosSchema = z
  .object({
    outage: z.boolean(),
    errorRate: z.coerce.number().min(0).max(1),
  })
  .partial()
  .strict();

/**
 * Mount the retriever's chaos control plane (dev/lab only, ADR-005):
 *   GET    /admin/chaos  → current chaos state
 *   POST   /admin/chaos  → merge a partial patch ({ outage } / { errorRate })
 *   DELETE /admin/chaos  → clear chaos (back to healthy)
 */
export function mountChaosSlice(app: OpenAPIHono): void {
  app.get("/admin/chaos", (c) => c.json(getChaos()));

  app.post("/admin/chaos", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = ChaosSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json({ error: { code: "validation_error", message: parsed.error.message } }, 422);
    }
    return c.json(setChaos(parsed.data));
  });

  app.delete("/admin/chaos", (c) => {
    clearChaos();
    return c.json(getChaos());
  });
}
