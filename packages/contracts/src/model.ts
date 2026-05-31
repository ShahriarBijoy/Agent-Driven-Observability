import { z } from "zod";
import { FinishReasonSchema, UsageSchema } from "./common";

/** POST /v1/complete (model-proxy service). */
export const CompleteRequestSchema = z.object({
  prompt: z.string().min(1).max(16384),
  context: z.array(z.string()).max(50).default([]),
  maxTokens: z.number().int().positive().max(2048).optional(),
});
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;

export const CompleteResponseSchema = z.object({
  completion: z.string(),
  model: z.string(),
  finishReason: FinishReasonSchema,
  usage: UsageSchema,
});
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;
