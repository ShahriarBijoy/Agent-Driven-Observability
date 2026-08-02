import type { CompleteRequest, CompleteResponse } from "@obs/contracts";
import type { FaultConfig } from "../../platform/config";
import { ModelError, ModelOverloadedError } from "../../platform/errors";
import { decideFault, sleep, type Rng } from "./faults";
import { generateCompletion } from "./generator";

export interface CompleteServiceDeps {
  readonly faults: FaultConfig;
  /**
   * Resolve the *effective* fault config per request — lets the Phase-6 chaos
   * control plane apply runtime overrides without restarting. Defaults to the
   * static `faults` (so tests stay deterministic).
   */
  readonly resolveFaults?: () => FaultConfig;
  /** Injected RNG (defaults to Math.random); overridden in tests. */
  readonly rng?: Rng;
  /** Injected clock for clustering windows (defaults to Date.now). */
  readonly now?: () => number;
}

export interface CompleteService {
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}

/**
 * The model-proxy core: runs the fault model first (which may throw a
 * model_error/model_overloaded or sleep), then emits the deterministic
 * completion. With `faults.faultsEnabled === false` it never errors and always
 * returns `finishReason: "stop"` (unless truncated by maxTokens).
 */
export function createCompleteService(deps: CompleteServiceDeps): CompleteService {
  const rng = deps.rng ?? Math.random;
  const clock = deps.now ?? Date.now;
  const resolveFaults = deps.resolveFaults ?? (() => deps.faults);

  return {
    async complete(req) {
      const outcome = decideFault(resolveFaults(), rng, clock());

      switch (outcome.kind) {
        case "error_500":
          throw new ModelError("the model failed to produce a completion");
        case "error_429":
          throw new ModelOverloadedError("the model is overloaded; retry later");
        case "stall":
          await sleep(outcome.stallMs);
          break;
        case "ok":
          if (outcome.latencyMs > 0) {
            await sleep(outcome.latencyMs);
          }
          break;
      }

      return generateCompletion(req);
    },
  };
}
