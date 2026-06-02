import { OpenAPIHono } from "@hono/zod-openapi";
import { honoTelemetry } from "@obs/telemetry";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError, toErrorResponse } from "./errors";

/**
 * Shared Hono app factory. Every service builds its app here so that the
 * health endpoint, OpenAPI doc, validation-error shape, error envelope, and
 * OpenTelemetry instrumentation are identical across the fleet.
 */
export function createApp(serviceName: string): OpenAPIHono {
  const startedAt = Date.now();

  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: { code: "validation_error", message: result.error.message } }, 422);
      }
      return undefined;
    },
  });

  // First middleware: one SERVER span per request + fleet-wide RED metrics.
  app.use("*", honoTelemetry(serviceName));

  app.get("/health", (c) =>
    c.json({ status: "ok" as const, service: serviceName, uptimeMs: Date.now() - startedAt }),
  );

  app.doc("/doc", {
    openapi: "3.0.0",
    info: { title: `${serviceName} API`, version: "0.0.0" },
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(toErrorResponse(err), err.status as ContentfulStatusCode);
    }
    console.error(`[${serviceName}] unhandled error:`, err);
    return c.json({ error: { code: "internal_error", message: "internal server error" } }, 500);
  });

  return app;
}
