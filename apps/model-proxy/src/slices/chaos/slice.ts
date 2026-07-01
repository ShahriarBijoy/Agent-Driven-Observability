import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import type { FaultConfig } from "../../platform/config";
import { clearFaultOverride, effectiveFaults, getFaultOverride, setFaultOverride } from "./state";

const Probability = z.coerce.number().min(0).max(1);
const PositiveInt = z.coerce.number().int().positive();
const PositiveNum = z.coerce.number().positive();

/**
 * Every fault knob is optional — a chaos phase patches only what it needs
 * (e.g. `{ p500: 0.6 }` for an error burst, `{ latencyBaseMs: 2500 }` for a
 * latency spike). `.strict()` rejects unknown keys so typos surface as 422s.
 */
const OverrideSchema = z
  .object({
    faultsEnabled: z.boolean(),
    p500: Probability,
    p429: Probability,
    pStall: Probability,
    stallMs: PositiveInt,
    latencyBaseMs: z.coerce.number().nonnegative(),
    latencyGammaShape: PositiveNum,
    latencyGammaScaleMs: PositiveNum,
    latencyMaxMs: PositiveInt,
    pBadMinute: Probability,
    badMinuteMs: PositiveInt,
    badMinuteMultiplier: PositiveNum,
  })
  .partial()
  .strict();

/**
 * Mount the runtime fault-control plane (dev/lab only, ADR-005):
 *   GET    /admin/chaos  → { base, override, effective }
 *   POST   /admin/chaos  → merge a partial fault override, returns the snapshot
 *   DELETE /admin/chaos  → clear the override (back to the env base)
 */
export function mountChaosSlice(app: OpenAPIHono, base: FaultConfig): void {
  const snapshot = () => ({
    base,
    override: getFaultOverride(),
    effective: effectiveFaults(base),
  });

  app.get("/admin/chaos", (c) => c.json(snapshot()));

  app.post("/admin/chaos", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = OverrideSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json({ error: { code: "validation_error", message: parsed.error.message } }, 422);
    }
    setFaultOverride(parsed.data);
    return c.json(snapshot());
  });

  app.delete("/admin/chaos", (c) => {
    clearFaultOverride();
    return c.json(snapshot());
  });
}
