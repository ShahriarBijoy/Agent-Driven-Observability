import { createRoute } from "@hono/zod-openapi";
import {
  EMBEDDING_DIM,
  ErrorResponseSchema,
  GatewayEmbedRequestSchema,
  GatewayEmbedResponseSchema,
} from "@obs/contracts";
import type { GatewayApp } from "../../../platform/http";
import type { EmbedderClient } from "../ports/clients";

const embedRoute = createRoute({
  method: "post",
  path: "/v1/embed",
  summary: "Passthrough to the embedder service",
  request: {
    body: {
      content: { "application/json": { schema: GatewayEmbedRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: GatewayEmbedResponseSchema } },
      description: "The embedding vector",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Missing or invalid bearer token",
    },
    422: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    429: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Rate limited",
    },
    502: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Upstream error",
    },
    504: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Upstream timeout",
    },
  },
});

export function registerEmbedRoute(app: GatewayApp, embedder: EmbedderClient): void {
  app.openapi(embedRoute, async (c) => {
    const { text } = c.req.valid("json");
    const result = await embedder.embed(text);
    return c.json(
      { embedding: result.embedding, dim: EMBEDDING_DIM as 384, cached: result.cached },
      200,
    );
  });
}
