import type { TokenCount } from "./token-count";

export type FinishReason = "stop" | "length" | "error";

/** The model-proxy's answer to a completion request. */
export interface Completion {
  readonly text: string;
  readonly model: string;
  readonly finishReason: FinishReason;
  readonly promptTokens: TokenCount;
  readonly completionTokens: TokenCount;
}
