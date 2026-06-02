import { context, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVER_ADDRESS,
  ATTR_URL_FULL,
} from "@opentelemetry/semantic-conventions";
import { getTracer } from "./tracing";

const HEADER_SETTER = {
  set(headers: Headers, key: string, value: string): void {
    headers.set(key, value);
  },
};

/**
 * A drop-in replacement for `fetch` that wraps the call in a CLIENT span and
 * injects W3C `traceparent` headers so the downstream service continues the
 * trace (this is what makes the gateway → {embedder,retriever,model-proxy}
 * edges appear in Grafana's service map). It is otherwise transparent: it does
 * not swallow timeouts or network errors — the caller's error handling is
 * unchanged.
 */
export async function tracedFetch(
  input: string | URL | Request,
  init?: RequestInit,
  options?: { spanName?: string },
): Promise<Response> {
  const tracer = getTracer("@obs/telemetry/fetch");
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const host = safeHost(url);

  const span = tracer.startSpan(options?.spanName ?? `${method} ${host ?? "fetch"}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: method,
      [ATTR_URL_FULL]: url,
      ...(host ? { [ATTR_SERVER_ADDRESS]: host } : {}),
    },
  });

  const ctx = trace.setSpan(context.active(), span);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  propagation.inject(ctx, headers, HEADER_SETTER);

  try {
    const res = await context.with(ctx, () => fetch(input, { ...init, headers }));
    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.status);
    if (res.status >= 400) span.setStatus({ code: SpanStatusCode.ERROR });
    return res;
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

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
