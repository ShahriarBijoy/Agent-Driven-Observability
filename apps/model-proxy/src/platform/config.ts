import { z } from "zod";

/** A probability in [0, 1]. */
const Probability = z.coerce.number().min(0).max(1);
const PositiveInt = z.coerce.number().int().positive();
const PositiveNum = z.coerce.number().positive();

const EnvSchema = z.object({
  MODEL_PROXY_PORT: z.coerce.number().int().positive().default(8083),

  // Master switch — when false, the fault model is fully deterministic.
  FAULTS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Per-request fault probabilities.
  FAULT_P_500: Probability.default(0.01),
  FAULT_P_429: Probability.default(0.03),
  FAULT_P_STALL: Probability.default(0.01),
  STALL_MS: PositiveInt.default(30000),

  // Gamma-distributed latency knobs.
  LATENCY_BASE_MS: z.coerce.number().nonnegative().default(40),
  LATENCY_GAMMA_SHAPE: PositiveNum.default(2.0),
  LATENCY_GAMMA_SCALE_MS: PositiveNum.default(60),
  LATENCY_MAX_MS: PositiveInt.default(4000),

  // Error clustering ("bad minute").
  FAULT_P_BAD_MINUTE: Probability.default(0.002),
  BAD_MINUTE_MS: PositiveInt.default(60000),
  BAD_MINUTE_MULTIPLIER: PositiveNum.default(8),
});

/** Tunable knobs for the fault model (spec §6.1). */
export interface FaultConfig {
  readonly faultsEnabled: boolean;
  readonly p500: number;
  readonly p429: number;
  readonly pStall: number;
  readonly stallMs: number;
  readonly latencyBaseMs: number;
  readonly latencyGammaShape: number;
  readonly latencyGammaScaleMs: number;
  readonly latencyMaxMs: number;
  readonly pBadMinute: number;
  readonly badMinuteMs: number;
  readonly badMinuteMultiplier: number;
}

export interface Config {
  readonly port: number;
  readonly faults: FaultConfig;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.MODEL_PROXY_PORT,
    faults: {
      faultsEnabled: parsed.FAULTS_ENABLED,
      p500: parsed.FAULT_P_500,
      p429: parsed.FAULT_P_429,
      pStall: parsed.FAULT_P_STALL,
      stallMs: parsed.STALL_MS,
      latencyBaseMs: parsed.LATENCY_BASE_MS,
      latencyGammaShape: parsed.LATENCY_GAMMA_SHAPE,
      latencyGammaScaleMs: parsed.LATENCY_GAMMA_SCALE_MS,
      latencyMaxMs: parsed.LATENCY_MAX_MS,
      pBadMinute: parsed.FAULT_P_BAD_MINUTE,
      badMinuteMs: parsed.BAD_MINUTE_MS,
      badMinuteMultiplier: parsed.BAD_MINUTE_MULTIPLIER,
    },
  };
}
