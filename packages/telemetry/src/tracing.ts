import {
  type Attributes,
  context,
  type Span,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from "@opentelemetry/api";

// Re-export the slice of the OTel API that application code legitimately needs,
// so no service has to depend on `@opentelemetry/*` directly.
export { context, SpanKind, SpanStatusCode, trace };
export type { Attributes, Span, Tracer };

/** Get a named tracer. Defaults to the active service name where available. */
export function getTracer(name = "@obs/telemetry"): Tracer {
  return trace.getTracer(name);
}

export interface SpanOptions {
  readonly kind?: SpanKind;
  readonly attributes?: Attributes;
  /** Tracer name; defaults to the package tracer. */
  readonly tracer?: string;
}

/**
 * Run `fn` inside a freshly-started span that becomes the active span for the
 * duration of the call (so nested `withSpan`/manual spans attach as children).
 * Records exceptions, marks the span errored on throw, and always ends it.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  opts: SpanOptions = {},
): Promise<T> {
  const tracer = getTracer(opts.tracer);
  const span = tracer.startSpan(name, {
    kind: opts.kind ?? SpanKind.INTERNAL,
    attributes: opts.attributes,
  });
  const ctx = trace.setSpan(context.active(), span);
  try {
    return await context.with(ctx, () => fn(span));
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    span.end();
  }
}

/** The currently-active span context's trace/span ids, if any. */
export function activeTraceIds(): { traceId?: string; spanId?: string } {
  const sc = trace.getSpan(context.active())?.spanContext();
  return { traceId: sc?.traceId, spanId: sc?.spanId };
}
