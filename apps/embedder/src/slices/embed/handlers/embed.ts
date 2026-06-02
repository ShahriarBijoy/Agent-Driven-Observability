import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  EmbedRequestSchema,
  EmbedResponseSchema,
  ErrorResponseSchema,
  EMBEDDING_DIM,
} from "@obs/contracts";
import { createLogger } from "@obs/telemetry";
import type { EmbedService } from "../service";

const log = createLogger("embedder");

const embedRoute = createRoute({
  method: "post",
  path: "/v1/embed",
  summary: "Embed text into a 384-dim vector",
  request: {
    body: {
      content: { "application/json": { schema: EmbedRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: EmbedResponseSchema } },
      description: "The embedding vector",
    },
    422: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
  },
});

export function registerEmbedRoute(app: OpenAPIHono, service: EmbedService): void {
  app.openapi(embedRoute, async (c) => {
    const { text } = c.req.valid("json");
    const result = await service.embed(text);
    log.info("embedded text", { textLength: text.length, cached: result.cached });
    return c.json(
      { embedding: result.embedding, dim: EMBEDDING_DIM as 384, cached: result.cached },
      200,
    );
  });
}
