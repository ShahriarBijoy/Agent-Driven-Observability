import { describe, expect, it } from "vitest";
import { chunkText, generateFallbackCorpus, stripGutenberg } from "./chunk";

describe("stripGutenberg", () => {
  it("removes the header and footer markers", () => {
    const raw = [
      "preamble license noise",
      "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***",
      "Real body sentence one. Real body sentence two.",
      "*** END OF THE PROJECT GUTENBERG EBOOK TEST ***",
      "trailing license noise",
    ].join("\n");
    const body = stripGutenberg(raw);
    expect(body).toContain("Real body sentence one.");
    expect(body).not.toContain("preamble license noise");
    expect(body).not.toContain("trailing license noise");
  });

  it("returns text unchanged when no markers are present", () => {
    expect(stripGutenberg("plain text body")).toBe("plain text body");
  });
});

describe("chunkText", () => {
  const corpus = generateFallbackCorpus(50);

  it("produces approximately N non-empty chunks", () => {
    const chunks = chunkText(corpus, "doc", 50);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(50);
    for (const chunk of chunks) {
      expect(chunk.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("assigns stable, sequential ids of the form docId-index", () => {
    const chunks = chunkText(corpus, "pg1342", 20);
    chunks.forEach((chunk, i) => {
      expect(chunk.id).toBe(`pg1342-${i}`);
      expect(chunk.docId).toBe("pg1342");
    });
  });

  it("is deterministic across runs", () => {
    const a = chunkText(corpus, "doc", 30);
    const b = chunkText(corpus, "doc", 30);
    expect(a).toEqual(b);
  });

  it("returns no chunks for empty input", () => {
    expect(chunkText("   ", "doc", 10)).toEqual([]);
  });
});

describe("generateFallbackCorpus", () => {
  it("yields distinct passages that chunk into non-empty bodies", () => {
    const chunks = chunkText(generateFallbackCorpus(10), "generated", 10);
    expect(chunks.length).toBeGreaterThan(0);
    const bodies = new Set(chunks.map((c) => c.body));
    expect(bodies.size).toBe(chunks.length);
  });
});
