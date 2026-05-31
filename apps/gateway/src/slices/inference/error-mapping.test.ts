import { describe, expect, it } from "vitest";
import { ModelOverloadedError, UpstreamError, UpstreamTimeoutError } from "../../platform/errors";
import type { UpstreamClient, UpstreamResponse } from "../../platform/upstream";
import { createModelHttpClient } from "./adapters/model-http";
import { createEmbedderHttpClient } from "./adapters/embedder-http";

function clientReturning(res: UpstreamResponse): UpstreamClient {
  return { postJson: async () => res };
}

function clientThrowing(err: unknown): UpstreamClient {
  return {
    postJson: async () => {
      throw err;
    },
  };
}

describe("upstream error mapping", () => {
  it("maps a model-proxy 429 to ModelOverloadedError (429 model_overloaded)", async () => {
    const model = createModelHttpClient(
      clientReturning({ status: 429, body: { error: { code: "model_overloaded" } } }),
    );
    await expect(model.complete("p", [])).rejects.toBeInstanceOf(ModelOverloadedError);
    await expect(model.complete("p", [])).rejects.toMatchObject({ status: 429 });
  });

  it("maps any other model-proxy non-2xx to UpstreamError (502)", async () => {
    const model = createModelHttpClient(
      clientReturning({ status: 500, body: { error: { code: "model_error" } } }),
    );
    const err = await model.complete("p", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).status).toBe(502);
  });

  it("propagates a timeout thrown by the shared client (504)", async () => {
    const embedder = createEmbedderHttpClient(
      clientThrowing(new UpstreamTimeoutError("embedder timed out")),
    );
    const err = await embedder.embed("hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
    expect((err as UpstreamTimeoutError).status).toBe(504);
  });

  it("maps a non-2xx embedder response to UpstreamError (502)", async () => {
    const embedder = createEmbedderHttpClient(clientReturning({ status: 503, body: null }));
    const err = await embedder.embed("hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).status).toBe(502);
  });
});
