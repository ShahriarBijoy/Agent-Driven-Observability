import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM } from "@obs/domain";
import { createMemoryCache } from "../cache/adapters/memory-cache";
import { cacheKey, createEmbedService } from "./service";

describe("embed service", () => {
  it("returns a 384-dim vector and reports a cache miss on first call", async () => {
    const svc = createEmbedService({ cache: createMemoryCache(), ttlSeconds: 60 });
    const result = await svc.embed("hello world");
    expect(result.embedding).toHaveLength(EMBEDDING_DIM);
    expect(result.cached).toBe(false);
  });

  it("serves the second identical call from cache", async () => {
    const svc = createEmbedService({ cache: createMemoryCache(), ttlSeconds: 60 });
    const first = await svc.embed("hello world");
    const second = await svc.embed("hello world");
    expect(second.cached).toBe(true);
    expect(second.embedding).toEqual(first.embedding);
  });

  it("is deterministic across independent service instances", async () => {
    const a = await createEmbedService({ cache: createMemoryCache(), ttlSeconds: 60 }).embed("xyz");
    const b = await createEmbedService({ cache: createMemoryCache(), ttlSeconds: 60 }).embed("xyz");
    expect(a.embedding).toEqual(b.embedding);
  });

  it("derives a stable emb:<hash> cache key", () => {
    expect(cacheKey("Hello World")).toBe(cacheKey("hello   world"));
    expect(cacheKey("a")).toMatch(/^emb:[0-9a-f]{8}$/);
  });
});
