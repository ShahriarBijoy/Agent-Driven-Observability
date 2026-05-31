import type { RetrievedChunk } from "@obs/contracts";
import { rankChunks } from "../rank/rank";
import type { ChunkStore } from "./ports/chunk-store";

export interface RetrieveServiceDeps {
  store: ChunkStore;
}

export interface RetrieveService {
  retrieve(embedding: number[], topK: number): Promise<RetrievedChunk[]>;
}

export function createRetrieveService(deps: RetrieveServiceDeps): RetrieveService {
  return {
    async retrieve(embedding, topK) {
      const rows = await deps.store.search(embedding, topK);
      return rankChunks(rows, topK);
    },
  };
}
