import { RetrieveResponseSchema } from "@obs/contracts";
import type { RetrievedChunk, RetrieveRequest } from "@obs/contracts";
import { UpstreamError } from "../../../platform/errors";
import type { UpstreamClient } from "../../../platform/upstream";
import type { RetrieverClient } from "../ports/clients";

/** HTTP adapter for the retriever upstream (`POST /v1/retrieve`). */
export function createRetrieverHttpClient(http: UpstreamClient): RetrieverClient {
  return {
    async retrieve(embedding: number[], topK: number): Promise<RetrievedChunk[]> {
      const reqBody: RetrieveRequest = { embedding, topK };
      const res = await http.postJson("/v1/retrieve", reqBody);
      if (res.status < 200 || res.status >= 300) {
        throw new UpstreamError(`retriever returned ${res.status}`);
      }
      const parsed = RetrieveResponseSchema.safeParse(res.body);
      if (!parsed.success) {
        throw new UpstreamError("retriever returned a malformed response");
      }
      return parsed.data.results;
    },
  };
}
