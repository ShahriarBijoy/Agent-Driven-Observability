import { z } from "zod";

export const EMBEDDING_DIM = 384;

/** Uniform error envelope returned by every service on non-2xx. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Uniform `GET /health` payload. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  uptimeMs: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Token accounting shared by model-proxy and gateway responses. */
export const UsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const FinishReasonSchema = z.enum(["stop", "length", "error"]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;
