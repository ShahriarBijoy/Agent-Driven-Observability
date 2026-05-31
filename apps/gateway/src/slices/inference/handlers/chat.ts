import { createRoute } from "@hono/zod-openapi";
import { ChatRequestSchema, ChatResponseSchema, ErrorResponseSchema } from "@obs/contracts";
import type { GatewayApp } from "../../../platform/http";
import type { InferenceService } from "../service";

const chatRoute = createRoute({
  method: "post",
  path: "/v1/chat",
  summary: "RAG chat: embed → retrieve → complete",
  request: {
    body: {
      content: { "application/json": { schema: ChatRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ChatResponseSchema } },
      description: "The completion plus the retrieved context refs",
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
      description: "Rate limited or model overloaded",
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

export function registerChatRoute(app: GatewayApp, service: InferenceService): void {
  app.openapi(chatRoute, async (c) => {
    const tenant = c.get("tenant");
    const { prompt, topK } = c.req.valid("json");
    const result = await service.chat({ tenant, prompt, topK });
    return c.json(result, 200);
  });
}
