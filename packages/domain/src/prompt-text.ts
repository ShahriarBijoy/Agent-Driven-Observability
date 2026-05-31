import type { Brand } from "./brand";

/** Free-text prompt sent by a client. Non-empty, bounded length. */
export type PromptText = Brand<string, "PromptText">;

export const MAX_PROMPT_CHARS = 8192;

export class InvalidPromptError extends Error {
  constructor(reason: string) {
    super(`invalid prompt: ${reason}`);
    this.name = "InvalidPromptError";
  }
}

export function makePromptText(value: string): PromptText {
  const v = value.trim();
  if (v.length === 0) {
    throw new InvalidPromptError("must be non-empty");
  }
  if (v.length > MAX_PROMPT_CHARS) {
    throw new InvalidPromptError(`exceeds ${MAX_PROMPT_CHARS} characters`);
  }
  return v as PromptText;
}
