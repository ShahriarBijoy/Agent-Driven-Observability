import { z } from "zod";
import { EMBEDDING_DIM } from "./common";

/** POST /v1/retrieve (retriever service). */
export const RetrieveRequestSchema = z.object({
  embedding: z.array(z.number()).length(EMBEDDING_DIM),
  topK: z.number().int().min(1).max(50).default(5),
});
export type RetrieveRequest = z.infer<typeof RetrieveRequestSchema>;

export const RetrievedChunkSchema = z.object({
  chunkId: z.string(),
  docId: z.string(),
  body: z.string(),
  score: z.number(),
});
export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;

export const RetrieveResponseSchema = z.object({
  results: z.array(RetrievedChunkSchema),
});
export type RetrieveResponse = z.infer<typeof RetrieveResponseSchema>;
