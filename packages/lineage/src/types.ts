// OpenLineage wire types (RunEvent and its parts). Facets are kept as open
// records — the builders in `facets.ts` produce the concrete shapes.

export type EventType = "START" | "RUNNING" | "COMPLETE" | "ABORT" | "FAIL" | "OTHER";

export interface JobRef {
  readonly namespace: string;
  readonly name: string;
}

/** An input or output dataset reference. */
export interface Dataset {
  readonly namespace: string;
  readonly name: string;
  readonly facets?: Record<string, unknown>;
}

export interface RunEvent {
  readonly eventType: EventType;
  readonly eventTime: string;
  readonly run: { readonly runId: string; readonly facets: Record<string, unknown> };
  readonly job: {
    readonly namespace: string;
    readonly name: string;
    readonly facets: Record<string, unknown>;
  };
  readonly inputs: Dataset[];
  readonly outputs: Dataset[];
  readonly producer: string;
  readonly schemaURL: string;
}
