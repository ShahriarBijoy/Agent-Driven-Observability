// Parent-run propagation over HTTP. The gateway stamps these headers on its
// upstream calls; the embedder/retriever read them to link their sub-runs back
// to the parent `rag.inference` run via the ParentRunFacet.

import type { ParentRef } from "./facets";

const HEADER_RUN_ID = "x-ol-parent-run-id";
const HEADER_JOB_NAMESPACE = "x-ol-parent-job-namespace";
const HEADER_JOB_NAME = "x-ol-parent-job-name";

/** Serialise a parent ref to `x-ol-*` request headers. */
export function parentRunHeaders(parent: ParentRef): Record<string, string> {
  return {
    [HEADER_RUN_ID]: parent.runId,
    [HEADER_JOB_NAMESPACE]: parent.jobNamespace,
    [HEADER_JOB_NAME]: parent.jobName,
  };
}

/** Reads a single header value; matches Hono's `c.req.header(name)`. */
export type HeaderGetter = (name: string) => string | null | undefined;

/**
 * Reconstruct a parent ref from request headers, or `null` when the parent is
 * absent or incomplete (a sub-run without a parent is still valid lineage).
 */
export function parentFromHeaders(get: HeaderGetter): ParentRef | null {
  const runId = get(HEADER_RUN_ID);
  const jobNamespace = get(HEADER_JOB_NAMESPACE);
  const jobName = get(HEADER_JOB_NAME);
  if (!runId || !jobNamespace || !jobName) return null;
  return { runId, jobNamespace, jobName };
}
