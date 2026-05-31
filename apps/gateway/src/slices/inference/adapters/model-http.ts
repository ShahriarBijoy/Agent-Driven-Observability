import { CompleteResponseSchema } from "@obs/contracts";
import type { CompleteRequest } from "@obs/contracts";
import { ModelOverloadedError, UpstreamError } from "../../../platform/errors";
import type { UpstreamClient } from "../../../platform/upstream";
import type { CompleteOutcome, ModelClient } from "../ports/clients";

/**
 * HTTP adapter for the model-proxy upstream (`POST /v1/complete`). A 429 from
 * the model proxy is propagated as a {@link ModelOverloadedError} (429
 * `model_overloaded`); any other non-2xx becomes a 502 `upstream_error`.
 */
export function createModelHttpClient(http: UpstreamClient): ModelClient {
  return {
    async complete(prompt: string, context: string[]): Promise<CompleteOutcome> {
      const reqBody: CompleteRequest = { prompt, context };
      const res = await http.postJson("/v1/complete", reqBody);
      if (res.status === 429) {
        throw new ModelOverloadedError();
      }
      if (res.status < 200 || res.status >= 300) {
        throw new UpstreamError(`model-proxy returned ${res.status}`);
      }
      const parsed = CompleteResponseSchema.safeParse(res.body);
      if (!parsed.success) {
        throw new UpstreamError("model-proxy returned a malformed response");
      }
      return {
        completion: parsed.data.completion,
        model: parsed.data.model,
        finishReason: parsed.data.finishReason,
        usage: parsed.data.usage,
      };
    },
  };
}
