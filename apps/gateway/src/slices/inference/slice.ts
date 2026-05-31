import type { GatewayApp } from "../../platform/http";
import { createUpstreamClient } from "../../platform/upstream";
import type { UsageWriter } from "../usage-metering/ports/usage-writer";
import { createEmbedderHttpClient } from "./adapters/embedder-http";
import { createModelHttpClient } from "./adapters/model-http";
import { createRetrieverHttpClient } from "./adapters/retriever-http";
import { registerChatRoute } from "./handlers/chat";
import { registerEmbedRoute } from "./handlers/embed";
import { createInferenceService } from "./service";
import type { EmbedderClient, ModelClient, RetrieverClient } from "./ports/clients";

export interface InferenceClients {
  embedder: EmbedderClient;
  retriever: RetrieverClient;
  model: ModelClient;
  usage: UsageWriter;
}

export interface InferenceSliceDeps {
  embedderUrl: string;
  retrieverUrl: string;
  modelProxyUrl: string;
  upstreamTimeoutMs: number;
  usage: UsageWriter;
}

/**
 * Register `/v1/chat` and the `/v1/embed` passthrough against pre-built clients.
 * Tests inject fakes here; production wires HTTP clients via {@link mountInferenceSlice}.
 */
export function registerInferenceRoutes(app: GatewayApp, clients: InferenceClients): void {
  const service = createInferenceService(clients);
  registerChatRoute(app, service);
  registerEmbedRoute(app, clients.embedder);
}

/**
 * Mount point for the inference feature. Builds the shared-timeout upstream
 * clients from URLs and registers the routes.
 */
export function mountInferenceSlice(app: GatewayApp, deps: InferenceSliceDeps): void {
  const embedder = createEmbedderHttpClient(
    createUpstreamClient({
      baseUrl: deps.embedderUrl,
      timeoutMs: deps.upstreamTimeoutMs,
      name: "embedder",
    }),
  );
  const retriever = createRetrieverHttpClient(
    createUpstreamClient({
      baseUrl: deps.retrieverUrl,
      timeoutMs: deps.upstreamTimeoutMs,
      name: "retriever",
    }),
  );
  const model = createModelHttpClient(
    createUpstreamClient({
      baseUrl: deps.modelProxyUrl,
      timeoutMs: deps.upstreamTimeoutMs,
      name: "model-proxy",
    }),
  );

  registerInferenceRoutes(app, { embedder, retriever, model, usage: deps.usage });
}
