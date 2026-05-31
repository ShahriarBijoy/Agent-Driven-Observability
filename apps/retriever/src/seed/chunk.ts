/** A corpus chunk ready for embedding + insertion. */
export interface Chunk {
  id: string;
  docId: string;
  body: string;
}

const GUTENBERG_START = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
const GUTENBERG_END = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

/**
 * Strip the Project Gutenberg header/footer, keeping only the body text. If the
 * markers aren't found (e.g. the generated fallback corpus) the input is
 * returned unchanged.
 */
export function stripGutenberg(raw: string): string {
  let text = raw;
  const startMatch = text.match(GUTENBERG_START);
  if (startMatch && startMatch.index !== undefined) {
    text = text.slice(startMatch.index + startMatch[0].length);
  }
  const endMatch = text.match(GUTENBERG_END);
  if (endMatch && endMatch.index !== undefined) {
    text = text.slice(0, endMatch.index);
  }
  return text.trim();
}

/**
 * Split `text` into approximately `count` non-empty chunks of a few sentences
 * each. Deterministic: the same input always yields the same chunks, and each
 * chunk gets a stable id `${docId}-${index}`.
 *
 * Pure (no I/O) so it can be unit tested without a network or DB.
 */
export function chunkText(text: string, docId: string, count: number): Chunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const target = Math.max(1, Math.trunc(count));

  // Split into sentence-ish units, then greedily pack them into `target` chunks.
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) {
    return [];
  }

  const perChunk = Math.max(1, Math.ceil(sentences.length / target));
  const chunks: Chunk[] = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    const body = sentences
      .slice(i, i + perChunk)
      .join(" ")
      .trim();
    if (body.length === 0) {
      continue;
    }
    const index = chunks.length;
    chunks.push({ id: `${docId}-${index}`, docId, body });
  }
  return chunks;
}

/**
 * Deterministic generated corpus used when the download fails (or offline). It
 * produces `count` distinct, non-empty paragraphs so the lab still has data to
 * retrieve over. Joined into a single text blob then chunked the normal way so
 * the chunk count + id scheme matches the download path.
 */
export function generateFallbackCorpus(count: number): string {
  const target = Math.max(1, Math.trunc(count));
  const topics = [
    "observability",
    "retrieval",
    "embeddings",
    "latency",
    "throughput",
    "caching",
    "tenancy",
    "resilience",
    "vectors",
    "ranking",
  ];
  const paragraphs: string[] = [];
  for (let i = 0; i < target; i++) {
    const topic = topics[i % topics.length]!;
    paragraphs.push(
      `Passage ${i} concerns ${topic}. ` +
        `It describes how a synthetic lab corpus models ${topic} in a deterministic way. ` +
        `This sentence ensures passage ${i} is distinct and non-empty for retrieval.`,
    );
  }
  return paragraphs.join("\n\n");
}
