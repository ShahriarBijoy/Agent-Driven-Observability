import { metrics as otelMetrics } from "@opentelemetry/api";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { onINP, onLCP } from "web-vitals";

/**
 * Browser RUM. Two signals leave the page, both to Alloy (OTLP/HTTP :4318):
 *
 *   - traces: every fetch becomes a client span, traceparent-propagated so the
 *     frontend span parents the gateway's server span — one tree from click to
 *     database.
 *   - metrics: browser RED (a real request counter) plus Web Vitals (LCP/INP).
 *     These are true counters/histograms, so — unlike span-derived metrics —
 *     they are NOT undercounted by the collector's trace tail sampling.
 *
 * Module-level init, guarded for SSR; imported once from the root route.
 */
declare global {
  // Survives Vite HMR re-evaluation; never double-registers.
  var __obsRumStarted: boolean | undefined;
}

if (typeof window !== "undefined" && !globalThis.__obsRumStarted) {
  globalThis.__obsRumStarted = true;

  const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: "web" });
  const tracesUrl = import.meta.env["VITE_OTLP_TRACES_URL"] ?? "http://localhost:4318/v1/traces";
  const metricsUrl = import.meta.env["VITE_OTLP_METRICS_URL"] ?? "http://localhost:4318/v1/metrics";

  // --- Traces ---
  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: tracesUrl }))],
  });
  tracerProvider.register({ contextManager: new ZoneContextManager() });

  // --- Metrics (browser RED + Web Vitals) ---
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: metricsUrl }),
        exportIntervalMillis: 10000,
      }),
    ],
  });
  otelMetrics.setGlobalMeterProvider(meterProvider);
  const meter = meterProvider.getMeter("web");

  // service="web" is recorded as an explicit attribute (not just a resource
  // attribute) so it becomes a Mimir label the Frontend dashboard can filter on.
  const requests = meter.createCounter("browser_http_requests", {
    description: "Browser fetch requests, by status class.",
  });
  const lcp = meter.createHistogram("browser_lcp_ms", {
    description: "Largest Contentful Paint (ms).",
    advice: { explicitBucketBoundaries: [500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 10000] },
  });
  const inp = meter.createHistogram("browser_inp_ms", {
    description: "Interaction to Next Paint (ms).",
    advice: { explicitBucketBoundaries: [50, 100, 200, 300, 500, 750, 1000, 2000] },
  });

  // Web Vitals fire once (or a few times) per page lifecycle.
  onLCP((m) => lcp.record(m.value, { service: "web" }));
  onINP((m) => inp.record(m.value, { service: "web" }));

  // --- Fetch instrumentation (spans + the RED counter) ---
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        // Propagate context to the BFF (same origin) and the gateway.
        propagateTraceHeaderCorsUrls: [/localhost:8080/, /localhost:3003/],
        clearTimingResources: true,
        applyCustomAttributesOnSpan: (_span, _request, result) => {
          const status = (result as { status?: number }).status ?? 0;
          const statusClass = status === 0 ? "error" : `${Math.floor(status / 100)}xx`;
          requests.add(1, {
            service: "web",
            status_class: statusClass,
            // Network failure (0) or any 5xx counts as an error, matching the
            // gateway's RED convention.
            is_error: String(status === 0 || status >= 500),
          });
        },
      }),
    ],
  });
}

export {};
