import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { ErrorResponseSchema, RetrieveRequestSchema, RetrieveResponseSchema } from "@obs/contracts";
import type { RetrieveService } from "../service";

const retrieveRoute = createRoute({
  method: "post",
  path: "/v1/retrieve",
  summary: "Retrieve the top-k most similar chunks for an embedding",
  request: {
    body: {
      content: { "application/json": { schema: RetrieveRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: RetrieveResponseSchema } },
      description: "The ranked chunks",
    },
    422: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
  },
});

export function registerRetrieveRoute(app: OpenAPIHono, service: RetrieveService): void {
  app.openapi(retrieveRoute, async (c) => {
    const { embedding, topK } = c.req.valid("json");
    const results = await service.retrieve(embedding, topK);
    return c.json({ results }, 200);
  });
}
