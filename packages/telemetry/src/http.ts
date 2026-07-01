import {
  context,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";
import { createMiddleware } from "hono/factory";
import { createHistogram, getMeter } from "./metrics";
import { getTracer } from "./tracing";

const HEADER_GETTER = {
  get(headers: Headers, key: string): string | undefined {
    return headers.get(key) ?? undefined;
  },
  keys(headers: Headers): string[] {
    return [...headers.keys()];
  },
};

// Second-scale buckets for HTTP server latency (RED duration). The 1.5s
// boundary exists so the Phase-6 latency SLO ("95% of /v1/chat under 1.5s") has
// an exact bucket edge to count against — choose your histogram boundaries to
// match your SLO thresholds.
const DURATION_BUCKETS_S = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 1.5, 2.5, 5, 10];

/**
 * Hono middleware that produces one SERVER span per request and the fleet-wide
 * RED metrics. It extracts W3C trace context from the incoming headers (so a
 * call from the gateway continues the same trace) and runs the handler inside
 * `context.with`, so every child span/log/metric exemplar attaches correctly.
 *
 * Mount it as the first middleware in each service's `createApp`.
 */
export function honoTelemetry(serviceName: string) {
  const tracer = getTracer(serviceName);
  const meter = getMeter(serviceName);
  const duration = createHistogram(meter, "request_duration_seconds", {
    description: "HTTP server request duration in seconds (with trace exemplars)",
    unit: "s",
    boundaries: DURATION_BUCKETS_S,
  });
  const active = meter.createUpDownCounter("active_requests", {
    description: "In-flight HTTP requests",
  });

  return createMiddleware(async (c, next) => {
    const method = c.req.method;
    const incoming = propagation.extract(context.active(), c.req.raw.headers, HEADER_GETTER);
    const span: Span = tracer.startSpan(
      method,
      {
        kind: SpanKind.SERVER,
        attributes: { [ATTR_HTTP_REQUEST_METHOD]: method, [ATTR_URL_PATH]: c.req.path },
      },
      incoming,
    );
    const ctx = trace.setSpan(incoming, span);

    active.add(1, { service: serviceName });
    const start = performance.now();
    let status = 500;
    try {
      await context.with(ctx, next);
      status = c.res.status;
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      const route = routeOf(c);
      const elapsedSeconds = (performance.now() - start) / 1000;
      span.updateName(`${method} ${route}`);
      span.setAttribute(ATTR_HTTP_ROUTE, route);
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, status);
      if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      duration.record(elapsedSeconds, {
        service: serviceName,
        http_route: route,
        http_method: method,
        http_status_code: String(status),
      });
      active.add(-1, { service: serviceName });
      span.end();
    }
  });
}

// The matched route template (low cardinality, e.g. "/v1/chat"); falls back to
// the raw path if the router did not record a template (e.g. 404s).
function routeOf(c: { req: { routePath?: string; path: string } }): string {
  const tmpl = c.req.routePath;
  return tmpl && tmpl !== "/*" ? tmpl : c.req.path;
}
