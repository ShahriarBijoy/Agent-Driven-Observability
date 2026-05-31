/**
 * Deterministic, dependency-free "fake" embedder.
 *
 * Real embeddings are out of scope for the lab — what matters is that the
 * function is (a) deterministic, so seeding and querying agree, and (b)
 * produces unit vectors so cosine similarity behaves sensibly: identical text
 * scores ~1.0, unrelated text scores ~0. Both `apps/embedder` and the corpus
 * seed script MUST import this exact function — never reimplement it.
 */

export const EMBEDDING_DIM = 384;

/** FNV-1a 32-bit hash → deterministic seed for the PRNG. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG seeded by the text hash. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalize text the same way on both write (seed) and read (query) paths. */
export function normalizeForEmbedding(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Produce a deterministic L2-normalized vector of length {@link EMBEDDING_DIM}.
 */
export function hashEmbedding(text: string, dim: number = EMBEDDING_DIM): number[] {
  const rand = mulberry32(fnv1a(normalizeForEmbedding(text)));
  const v = new Array<number>(dim);
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    const x = rand() * 2 - 1; // (-1, 1)
    v[i] = x;
    sumSq += x * x;
  }
  const inv = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0;
  for (let i = 0; i < dim; i++) {
    v[i] = v[i]! * inv;
  }
  return v;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
