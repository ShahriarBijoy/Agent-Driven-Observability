import { describe, expect, it } from "vitest";
import { rankChunks, type ScoredRow } from "./rank";

function row(chunkId: string, score: number): ScoredRow {
  return { chunkId, docId: "doc", body: `body-${chunkId}`, score };
}

describe("rankChunks", () => {
  it("sorts rows by score descending", () => {
    const ranked = rankChunks([row("a", 0.1), row("b", 0.9), row("c", 0.5)], 10);
    expect(ranked.map((r) => r.chunkId)).toEqual(["b", "c", "a"]);
  });

  it("clamps the result to topK", () => {
    const ranked = rankChunks([row("a", 0.1), row("b", 0.9), row("c", 0.5)], 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.map((r) => r.chunkId)).toEqual(["b", "c"]);
  });

  it("maps DB rows to the RetrievedChunk shape", () => {
    const [ranked] = rankChunks([row("x", 0.7)], 1);
    expect(ranked).toEqual({ chunkId: "x", docId: "doc", body: "body-x", score: 0.7 });
  });

  it("returns an empty array for topK <= 0", () => {
    expect(rankChunks([row("a", 0.9)], 0)).toEqual([]);
    expect(rankChunks([row("a", 0.9)], -3)).toEqual([]);
  });

  it("handles an empty input", () => {
    expect(rankChunks([], 5)).toEqual([]);
  });
});
