// Pure builders for OpenLineage RunEvents. `eventTime` is injected (not read
// from a clock) so the builders are deterministic and unit-testable; the client
// stamps the wall-clock time at emit.

import { errorMessageFacet } from "./facets";
import { PRODUCER, RUN_EVENT_SCHEMA_URL } from "./spec";
import type { Dataset, EventType, JobRef, RunEvent } from "./types";

export interface EventArgs {
  readonly runId: string;
  readonly job: JobRef;
  readonly eventTime: string;
  readonly inputs?: Dataset[];
  readonly outputs?: Dataset[];
  readonly runFacets?: Record<string, unknown>;
  readonly jobFacets?: Record<string, unknown>;
}

function makeEvent(eventType: EventType, args: EventArgs): RunEvent {
  return {
    eventType,
    eventTime: args.eventTime,
    run: { runId: args.runId, facets: args.runFacets ?? {} },
    job: { namespace: args.job.namespace, name: args.job.name, facets: args.jobFacets ?? {} },
    inputs: args.inputs ?? [],
    outputs: args.outputs ?? [],
    producer: PRODUCER,
    schemaURL: RUN_EVENT_SCHEMA_URL,
  };
}

/** START — the run has begun. Carries inputs (and optional run/job facets). */
export function startEvent(args: EventArgs): RunEvent {
  return makeEvent("START", args);
}

/** COMPLETE — the run finished successfully. Reuses the same `runId`. */
export function completeEvent(args: EventArgs): RunEvent {
  return makeEvent("COMPLETE", args);
}

export interface FailEventArgs extends Omit<EventArgs, "runFacets"> {
  readonly error: unknown;
  readonly runFacets?: Record<string, unknown>;
}

/** FAIL — the run errored. Attaches an `errorMessage` run facet from `error`. */
export function failEvent(args: FailEventArgs): RunEvent {
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  const stack = args.error instanceof Error ? args.error.stack : undefined;
  return makeEvent("FAIL", {
    runId: args.runId,
    job: args.job,
    eventTime: args.eventTime,
    inputs: args.inputs,
    outputs: args.outputs,
    jobFacets: args.jobFacets,
    runFacets: { ...(args.runFacets ?? {}), errorMessage: errorMessageFacet(message, stack) },
  });
}
