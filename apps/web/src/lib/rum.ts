import { ZoneContextManager } from "@opentelemetry/context-zone";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/**
 * Browser RUM: every fetch the UI makes becomes a client span, exported to
 * Alloy (OTLP/HTTP :4318) and propagated via traceparent so frontend spans
 * parent the gateway's server spans — one trace tree from click to database.
 *
 * Module-level init, guarded for SSR; imported once from the root route.
 */
declare global {
  // Survives Vite HMR re-evaluation; never double-registers.
  var __obsRumStarted: boolean | undefined;
}

if (typeof window !== "undefined" && !globalThis.__obsRumStarted) {
  globalThis.__obsRumStarted = true;

  const otlpUrl = import.meta.env["VITE_OTLP_TRACES_URL"] ?? "http://localhost:4318/v1/traces";

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "web" }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: otlpUrl }))],
  });
  provider.register({ contextManager: new ZoneContextManager() });

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        // Propagate context to the BFF (same origin) and the gateway.
        propagateTraceHeaderCorsUrls: [/localhost:8080/, /localhost:3003/],
        clearTimingResources: true,
      }),
    ],
  });
}

export {};
