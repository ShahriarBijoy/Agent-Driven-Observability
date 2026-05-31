import { describe, expect, it } from "vitest";
import { CompleteRequestSchema } from "@obs/contracts";
import { generateCompletion } from "./generator";

/** Parse through the contract so `context` defaulting matches production. */
function makeRequest(input: { prompt: string; context?: string[]; maxTokens?: number }) {
  return CompleteRequestSchema.parse(input);
}

describe("generateCompletion", () => {
  it("is deterministic for a fixed prompt", () => {
    const req = makeRequest({ prompt: "What is the capital of France?" });
    const a = generateCompletion(req);
    const b = generateCompletion(req);
    expect(a).toEqual(b);
    expect(a.completion.length).toBeGreaterThan(0);
  });

  it("produces different completions for different prompts", () => {
    const a = generateCompletion(makeRequest({ prompt: "alpha" }));
    const b = generateCompletion(makeRequest({ prompt: "beta" }));
    expect(a.completion).not.toBe(b.completion);
  });

  it("always reports model = mock-llm-v1", () => {
    expect(generateCompletion(makeRequest({ prompt: "hi" })).model).toBe("mock-llm-v1");
  });

  it("references the first context item when context is non-empty", () => {
    const context = [
      "Paris is the capital and most populous city of France.",
      "unused second chunk",
    ];
    const res = generateCompletion(makeRequest({ prompt: "capital?", context }));
    expect(res.completion.startsWith('Based on: "')).toBe(true);
    // The quote is drawn from context[0], not context[1].
    expect(res.completion).toContain("Paris is the capital");
    expect(res.completion).not.toContain("unused second chunk");
  });

  it("truncates the first context item to 80 chars in the quote", () => {
    const long = "x".repeat(200);
    const res = generateCompletion(makeRequest({ prompt: "p", context: [long] }));
    const match = res.completion.match(/^Based on: "([^"]*)"/);
    expect(match).not.toBeNull();
    expect(match?.[1]?.length).toBe(80);
  });

  it("returns finishReason=stop and full text when not truncated", () => {
    const res = generateCompletion(makeRequest({ prompt: "no cap here" }));
    expect(res.finishReason).toBe("stop");
  });

  it("returns finishReason=length and truncated text when over maxTokens", () => {
    const context = ["A very long retrieved chunk ".repeat(20)];
    const res = generateCompletion(makeRequest({ prompt: "long", context, maxTokens: 1 }));
    expect(res.finishReason).toBe("length");
    expect(res.completion.length).toBeLessThanOrEqual(4); // maxTokens(1) * 4 chars/token
  });

  it("computes non-negative integer usage", () => {
    const res = generateCompletion(makeRequest({ prompt: "compute usage", context: ["ctx"] }));
    expect(Number.isInteger(res.usage.promptTokens)).toBe(true);
    expect(Number.isInteger(res.usage.completionTokens)).toBe(true);
    expect(res.usage.promptTokens).toBeGreaterThanOrEqual(0);
    expect(res.usage.completionTokens).toBeGreaterThanOrEqual(0);
  });
});
