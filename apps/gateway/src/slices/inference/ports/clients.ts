import type { RetrievedChunk } from "@obs/contracts";

/** Result of embedding a prompt via the embedder service. */
export interface EmbedOutcome {
  readonly embedding: number[];
  readonly cached: boolean;
}

/** Result of a model completion via the model-proxy service. */
export interface CompleteOutcome {
  readonly completion: string;
  readonly model: string;
  readonly finishReason: "stop" | "length" | "error";
  readonly usage: { promptTokens: number; completionTokens: number };
}

/** Port: the embedder upstream. */
export interface EmbedderClient {
  embed(text: string): Promise<EmbedOutcome>;
}

/** Port: the retriever upstream. */
export interface RetrieverClient {
  retrieve(embedding: number[], topK: number): Promise<RetrievedChunk[]>;
}

/** Port: the model-proxy upstream. */
export interface ModelClient {
  complete(prompt: string, context: string[]): Promise<CompleteOutcome>;
}
