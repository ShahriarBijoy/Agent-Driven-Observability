import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { CompleteRequestSchema, CompleteResponseSchema, ErrorResponseSchema } from "@obs/contracts";
import type { CompleteService } from "../service";

const completeRoute = createRoute({
  method: "post",
  path: "/v1/complete",
  summary: "Generate a deterministic mock completion (with optional fault injection)",
  request: {
    body: {
      content: { "application/json": { schema: CompleteRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CompleteResponseSchema } },
      description: "The generated completion",
    },
    422: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    429: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The model is overloaded",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The model failed",
    },
  },
});

export function registerCompleteRoute(app: OpenAPIHono, service: CompleteService): void {
  app.openapi(completeRoute, async (c) => {
    const req = c.req.valid("json");
    const result = await service.complete(req);
    return c.json(result, 200);
  });
}
