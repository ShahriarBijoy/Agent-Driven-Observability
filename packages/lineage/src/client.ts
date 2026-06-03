// The lineage emitter: builds RunEvents and POSTs them to Marquez's
// `/api/v1/lineage` endpoint. Emission is best-effort — a Marquez outage must
// never fail the request that produced the lineage.

import { completeEvent, failEvent, startEvent } from "./events";
import { type ParentRef, parentRunFacet } from "./facets";
import type { Dataset, JobRef, RunEvent } from "./types";

export interface LineageLogger {
  warn(message: string, attrs?: Record<string, unknown>): void;
}

export interface LineageEmitterOptions {
  /** Marquez base URL, e.g. `http://marquez-api:5000`. */
  readonly url: string;
  /** When false, every method is a no-op (no network calls). */
  readonly enabled: boolean;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** Event-time provider (injected for tests); defaults to wall clock. */
  readonly now?: () => string;
  readonly logger?: LineageLogger;
}

export interface StartArgs {
  readonly runId: string;
  readonly job: JobRef;
  readonly inputs?: Dataset[];
  readonly outputs?: Dataset[];
  readonly parent?: ParentRef | null;
  readonly runFacets?: Record<string, unknown>;
}

export type CompleteArgs = StartArgs;

export interface FailArgs {
  readonly runId: string;
  readonly job: JobRef;
  readonly error: unknown;
  readonly inputs?: Dataset[];
  readonly outputs?: Dataset[];
  readonly parent?: ParentRef | null;
  readonly runFacets?: Record<string, unknown>;
}

export interface LineageEmitter {
  /** Emit a START event for `runId`. */
  start(args: StartArgs): Promise<void>;
  /** Emit a COMPLETE event reusing `runId`. */
  complete(args: CompleteArgs): Promise<void>;
  /** Emit a FAIL event reusing `runId`, with an errorMessage facet. */
  fail(args: FailArgs): Promise<void>;
}

/** Merge a parent ref into a run's facets as the `parent` facet. */
function withParent(
  runFacets: Record<string, unknown> | undefined,
  parent: ParentRef | null | undefined,
): Record<string, unknown> | undefined {
  if (!parent) return runFacets;
  return { ...(runFacets ?? {}), parent: parentRunFacet(parent) };
}

export function createLineageEmitter(opts: LineageEmitterOptions): LineageEmitter {
  const endpoint = `${opts.url.replace(/\/$/, "")}/api/v1/lineage`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date().toISOString());
  const timeoutMs = opts.timeoutMs ?? 3000;

  async function emit(event: RunEvent): Promise<void> {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        opts.logger?.warn("lineage emit non-2xx", {
          status: res.status,
          job: event.job.name,
          eventType: event.eventType,
        });
      }
    } catch (err) {
      opts.logger?.warn("lineage emit failed", {
        reason: err instanceof Error ? err.message : String(err),
        job: event.job.name,
        eventType: event.eventType,
      });
    }
  }

  return {
    async start(args) {
      if (!opts.enabled) return;
      await emit(
        startEvent({
          runId: args.runId,
          job: args.job,
          eventTime: now(),
          inputs: args.inputs,
          outputs: args.outputs,
          runFacets: withParent(args.runFacets, args.parent),
        }),
      );
    },
    async complete(args) {
      if (!opts.enabled) return;
      await emit(
        completeEvent({
          runId: args.runId,
          job: args.job,
          eventTime: now(),
          inputs: args.inputs,
          outputs: args.outputs,
          runFacets: withParent(args.runFacets, args.parent),
        }),
      );
    },
    async fail(args) {
      if (!opts.enabled) return;
      await emit(
        failEvent({
          runId: args.runId,
          job: args.job,
          eventTime: now(),
          error: args.error,
          inputs: args.inputs,
          outputs: args.outputs,
          runFacets: withParent(args.runFacets, args.parent),
        }),
      );
    },
  };
}
