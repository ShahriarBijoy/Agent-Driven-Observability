import { z } from "zod";
import { UsageSchema } from "./common";
import { EmbedRequestSchema, EmbedResponseSchema } from "./embedder";

/** POST /v1/chat (gateway service) — the public RAG entrypoint. */
export const ChatRequestSchema = z.object({
  prompt: z.string().min(1).max(8192),
  topK: z.number().int().min(1).max(20).default(3),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** A retrieved chunk as surfaced to the gateway client (body truncated to a snippet). */
export const RetrievedRefSchema = z.object({
  chunkId: z.string(),
  docId: z.string(),
  score: z.number(),
  snippet: z.string(),
});
export type RetrievedRef = z.infer<typeof RetrievedRefSchema>;

export const ChatResponseSchema = z.object({
  completion: z.string(),
  model: z.string(),
  usage: UsageSchema,
  retrieved: z.array(RetrievedRefSchema),
  cached: z.boolean(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

/** POST /v1/embed (gateway passthrough to the embedder). */
export const GatewayEmbedRequestSchema = EmbedRequestSchema;
export type GatewayEmbedRequest = z.infer<typeof GatewayEmbedRequestSchema>;
export const GatewayEmbedResponseSchema = EmbedResponseSchema;
export type GatewayEmbedResponse = z.infer<typeof GatewayEmbedResponseSchema>;
