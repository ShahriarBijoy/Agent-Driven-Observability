import type { FaultConfig } from "../../platform/config";

/**
 * A uniform random source in [0, 1). Injected so the fault model is fully
 * unit-testable: tests pass a deterministic/seeded RNG, production uses
 * `Math.random`. A normal-variate source is derived from this via Box–Muller
 * inside the gamma sampler.
 */
export type Rng = () => number;

/** What the fault model decided to do for a single request. */
export type FaultOutcome =
  | { readonly kind: "ok"; readonly latencyMs: number }
  | { readonly kind: "stall"; readonly stallMs: number }
  | { readonly kind: "error_500" }
  | { readonly kind: "error_429" };

/**
 * Standard-normal sample via the Box–Muller transform. Marsaglia–Tsang needs a
 * normal variate; we derive it from the same injected uniform RNG so a single
 * source seeds the whole model.
 */
function sampleStandardNormal(rng: Rng): number {
  // Guard against log(0): u1 must be strictly positive.
  let u1 = rng();
  while (u1 <= 0) {
    u1 = rng();
  }
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Gamma sampler (Marsaglia & Tsang, 2000). Returns a positive, finite sample
 * from a Gamma(shape, scale) distribution. Handles `shape < 1` via the boosting
 * trick. The RNG is injected for determinism in tests.
 */
export function sampleGamma(shape: number, scale: number, rng: Rng): number {
  if (shape <= 0 || scale <= 0) {
    throw new Error(`sampleGamma requires positive shape/scale, got ${shape}/${scale}`);
  }

  // Boost shape < 1 up to >= 1 and correct with a uniform power afterwards.
  if (shape < 1) {
    let u = rng();
    while (u <= 0) {
      u = rng();
    }
    return sampleGamma(shape + 1, scale, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // Rejection loop — guaranteed to terminate with overwhelming probability.
  for (;;) {
    let x = sampleStandardNormal(rng);
    let v = 1 + c * x;
    while (v <= 0) {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    }
    v = v * v * v;

    let u = rng();
    while (u <= 0) {
      u = rng();
    }

    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) {
      return d * v * scale;
    }
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/** Base + gamma latency, clamped to [0, latencyMaxMs]. Always positive/finite. */
export function sampleLatencyMs(cfg: FaultConfig, rng: Rng): number {
  const gamma = sampleGamma(cfg.latencyGammaShape, cfg.latencyGammaScaleMs, rng);
  const total = cfg.latencyBaseMs + gamma;
  return Math.min(total, cfg.latencyMaxMs);
}

/**
 * Module-level "bad minute" state. Error clustering: once a degraded window is
 * entered it persists for `badMinuteMs`, multiplying the 500/429 rates. State
 * is deliberately module-scoped so it survives across requests within a process.
 */
let badMinuteUntil = 0;

/** Test/process hook to reset clustering state. */
export function resetBadMinute(): void {
  badMinuteUntil = 0;
}

/** True if we are currently inside a degraded window. */
export function isInBadMinute(now: number = Date.now()): boolean {
  return now < badMinuteUntil;
}

/**
 * Decide the fault outcome for one request.
 *
 * - `FAULTS_ENABLED=false` → always `{ kind: "ok", latencyMs: 0 }` (no RNG draws,
 *   no clustering, fully deterministic — the unit-test path).
 * - Otherwise draws (in order) bad-minute entry, 500, 429, stall, then latency.
 *
 * The `now` clock is injectable so clustering windows are testable without
 * real time.
 */
export function decideFault(cfg: FaultConfig, rng: Rng, now: number = Date.now()): FaultOutcome {
  if (!cfg.faultsEnabled) {
    return { kind: "ok", latencyMs: 0 };
  }

  // Possibly enter a degraded window.
  if (!isInBadMinute(now) && rng() < cfg.pBadMinute) {
    badMinuteUntil = now + cfg.badMinuteMs;
  }

  const multiplier = isInBadMinute(now) ? cfg.badMinuteMultiplier : 1;
  const p500 = Math.min(cfg.p500 * multiplier, 1);
  const p429 = Math.min(cfg.p429 * multiplier, 1);

  if (rng() < p500) {
    return { kind: "error_500" };
  }
  if (rng() < p429) {
    return { kind: "error_429" };
  }
  if (rng() < cfg.pStall) {
    return { kind: "stall", stallMs: cfg.stallMs };
  }

  return { kind: "ok", latencyMs: sampleLatencyMs(cfg, rng) };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
