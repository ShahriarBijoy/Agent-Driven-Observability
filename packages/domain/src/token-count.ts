import type { Brand } from "./brand";

/** A non-negative integer count of tokens. */
export type TokenCount = Brand<number, "TokenCount">;

export class InvalidTokenCountError extends Error {
  constructor(value: number) {
    super(`invalid token count: ${value}`);
    this.name = "InvalidTokenCountError";
  }
}

export function makeTokenCount(value: number): TokenCount {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidTokenCountError(value);
  }
  return value as TokenCount;
}

/**
 * Cheap, deterministic token estimate (~4 chars/token). Good enough for
 * usage-metering in a lab; never call a real tokenizer here.
 */
export function estimateTokens(text: string): TokenCount {
  return makeTokenCount(Math.ceil(text.trim().length / 4));
}

export function addTokens(a: TokenCount, b: TokenCount): TokenCount {
  return (a + b) as TokenCount;
}
