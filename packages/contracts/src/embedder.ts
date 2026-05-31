import { z } from "zod";
import { EMBEDDING_DIM } from "./common";

/** POST /v1/embed (embedder service). */
export const EmbedRequestSchema = z.object({
  text: z.string().min(1).max(8192),
});
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;

export const EmbedResponseSchema = z.object({
  embedding: z.array(z.number()).length(EMBEDDING_DIM),
  dim: z.literal(EMBEDDING_DIM),
  cached: z.boolean(),
});
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;
