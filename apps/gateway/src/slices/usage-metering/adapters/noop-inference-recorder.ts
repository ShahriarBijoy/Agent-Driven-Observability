import type { InferenceRecorder } from "../ports/inference-recorder";

/** No-op inference recorder used in tests and when no DATABASE_URL is configured. */
export function createNoopInferenceRecorder(): InferenceRecorder {
  return {
    async record() {
      // intentionally does nothing
    },
    async close() {
      // nothing to close
    },
  };
}
