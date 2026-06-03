// @obs/lineage — OpenLineage event helpers for the TS service fleet. Build
// RunEvents and emit them to Marquez. See docs/adr/004-data-observability.md.

export {
  type CompleteArgs,
  createLineageEmitter,
  type FailArgs,
  type LineageEmitter,
  type LineageEmitterOptions,
  type LineageLogger,
  type StartArgs,
} from "./client";
export { type ChildRunSpec, withChildRun } from "./child-run";
export { type LineageOptions, resolveLineageOptions } from "./config";
export {
  DS_CACHE_EMBEDDINGS,
  DS_COMPLETIONS_RECENT,
  DS_PROMPTS_INCOMING,
  DS_PROMPTS_RECENT,
  DS_RETRIEVAL_RESULTS,
  DS_VECTOR_STORE_CHUNKS,
  JOB_EMBED,
  JOB_INFERENCE,
  JOB_RETRIEVE,
} from "./datasets";
export { completeEvent, type EventArgs, failEvent, type FailEventArgs, startEvent } from "./events";
export {
  errorMessageFacet,
  type ErrorMessageRunFacet,
  nominalTimeFacet,
  type NominalTimeRunFacet,
  type ParentRef,
  parentRunFacet,
  type ParentRunFacet,
  retrievalStatsFacet,
  type RetrievalStatsRunFacet,
} from "./facets";
export { type HeaderGetter, parentFromHeaders, parentRunHeaders } from "./headers";
export { newRunId } from "./ids";
export { DEFAULT_NAMESPACE, PRODUCER } from "./spec";
export type { Dataset, EventType, JobRef, RunEvent } from "./types";
