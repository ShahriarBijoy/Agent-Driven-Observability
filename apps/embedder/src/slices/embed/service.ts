import { hashEmbedding, normalizeForEmbedding } from "@obs/domain";
import type { CacheStore } from "../cache/ports/cache-store";

export interface EmbedResult {
  embedding: number[];
  cached: boolean;
}

export interface EmbedServiceDeps {
  cache: CacheStore;
  ttlSeconds: number;
}

/** FNV-1a hex — short, dependency-free key fragment for the `emb:<hash>` keyspace. */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function cacheKey(text: string): string {
  return `emb:${fnv1aHex(normalizeForEmbedding(text))}`;
}

export interface EmbedService {
  embed(text: string): Promise<EmbedResult>;
}

export function createEmbedService(deps: EmbedServiceDeps): EmbedService {
  return {
    async embed(text) {
      const key = cacheKey(text);
      const hit = await deps.cache.get(key);
      if (hit) {
        return { embedding: JSON.parse(hit) as number[], cached: true };
      }
      const embedding = hashEmbedding(text);
      await deps.cache.set(key, JSON.stringify(embedding), deps.ttlSeconds);
      return { embedding, cached: false };
    },
  };
}
