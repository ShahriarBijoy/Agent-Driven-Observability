import { EmbedResponseSchema } from "@obs/contracts";
import type { EmbedRequest } from "@obs/contracts";
import { UpstreamError } from "../../../platform/errors";
import type { UpstreamClient } from "../../../platform/upstream";
import type { EmbedderClient, EmbedOutcome } from "../ports/clients";

/** HTTP adapter for the embedder upstream (`POST /v1/embed`). */
export function createEmbedderHttpClient(http: UpstreamClient): EmbedderClient {
  return {
    async embed(text: string): Promise<EmbedOutcome> {
      const reqBody: EmbedRequest = { text };
      const res = await http.postJson("/v1/embed", reqBody);
      if (res.status < 200 || res.status >= 300) {
        throw new UpstreamError(`embedder returned ${res.status}`);
      }
      const parsed = EmbedResponseSchema.safeParse(res.body);
      if (!parsed.success) {
        throw new UpstreamError("embedder returned a malformed response");
      }
      return { embedding: parsed.data.embedding, cached: parsed.data.cached };
    },
  };
}
