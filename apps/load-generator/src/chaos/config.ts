import { z } from "zod";

/**
 * Env schema for the chaos scheduler. Defaults assume the host-run lab (the
 * subject services publish 8080/8082/8083 on localhost); inside compose, set
 * the *_URL vars to the service DNS names.
 */
const EnvSchema = z.object({
  GATEWAY_URL: z.string().min(1).default("http://localhost:8080"),
  MODEL_PROXY_URL: z.string().min(1).default("http://localhost:8083"),
  RETRIEVER_URL: z.string().min(1).default("http://localhost:8082"),
  // Path to the schedule YAML; defaults to the full Plan §p6 cycle.
  CHAOS_SCHEDULE: z.string().min(1).optional(),
  // Baseline traffic the scheduler drives throughout the cycle.
  CHAOS_TARGET_QPS: z.coerce.number().positive().default(40),
  CHAOS_CONCURRENCY: z.coerce.number().int().positive().default(32),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

export interface ChaosConfig {
  readonly gatewayUrl: string;
  readonly modelProxyUrl: string;
  readonly retrieverUrl: string;
  readonly schedulePath: string;
  readonly targetQps: number;
  readonly concurrency: number;
  readonly requestTimeoutMs: number;
}

export function loadChaosConfig(
  defaultSchedulePath: string,
  env: Record<string, string | undefined> = process.env,
): ChaosConfig {
  const parsed = EnvSchema.parse(env);
  return {
    gatewayUrl: parsed.GATEWAY_URL.replace(/\/+$/, ""),
    modelProxyUrl: parsed.MODEL_PROXY_URL.replace(/\/+$/, ""),
    retrieverUrl: parsed.RETRIEVER_URL.replace(/\/+$/, ""),
    schedulePath: parsed.CHAOS_SCHEDULE ?? defaultSchedulePath,
    targetQps: parsed.CHAOS_TARGET_QPS,
    concurrency: parsed.CHAOS_CONCURRENCY,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  };
}
