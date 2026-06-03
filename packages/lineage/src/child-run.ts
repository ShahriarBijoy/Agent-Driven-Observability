// Helper for emitting a child sub-run around a unit of work. Used by the
// embedder and retriever to wrap their work in a `rag.embed` / `rag.retrieve`
// run linked to the gateway's parent `rag.inference` run.

import type { LineageEmitter } from "./client";
import type { ParentRef } from "./facets";
import { newRunId } from "./ids";
import type { Dataset, JobRef } from "./types";

export interface ChildRunSpec {
  readonly job: JobRef;
  readonly inputs?: Dataset[];
  readonly outputs?: Dataset[];
  /** The parent run to link to; when null/undefined the work runs unwrapped. */
  readonly parent: ParentRef | null | undefined;
}

/**
 * Run `work` as one OpenLineage sub-run: START before, COMPLETE after success,
 * FAIL (and rethrow) on error. When there is no parent — i.e. the call is not
 * part of an inference — `work` runs without emitting any lineage.
 */
export async function withChildRun<T>(
  lineage: LineageEmitter,
  spec: ChildRunSpec,
  work: () => Promise<T>,
): Promise<T> {
  if (!spec.parent) {
    return work();
  }
  const runId = newRunId();
  await lineage.start({ runId, job: spec.job, inputs: spec.inputs, parent: spec.parent });
  try {
    const result = await work();
    await lineage.complete({ runId, job: spec.job, outputs: spec.outputs, parent: spec.parent });
    return result;
  } catch (err) {
    await lineage.fail({ runId, job: spec.job, error: err, parent: spec.parent });
    throw err;
  }
}
