/** A single chunk returned by the retriever, with its similarity score. */
export interface RetrievalResult {
  readonly chunkId: string;
  readonly docId: string;
  readonly body: string;
  /** Cosine similarity in [-1, 1]; higher is closer. */
  readonly score: number;
}
