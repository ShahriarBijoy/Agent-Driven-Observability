import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export interface ServiceInfo {
  readonly name: string;
  readonly version: string;
}

let started = false;
let current: ServiceInfo = { name: "unknown_service", version: "0.0.0" };

/**
 * Initialise the OpenTelemetry SDK for a service. Call this once, at the very
 * top of `src/main.ts`, before any application code runs.
 *
 * We run with `instrumentations: []` on purpose: the services run on **Bun**,
 * whose native `fetch`/`Bun.serve` are not the Node `http` module that the OTel
 * auto-instrumentations patch, and Bun does not implement the ESM module hooks
 * those instrumentations rely on. So all spans/metrics/logs are produced by the
 * shared manual helpers in this package (see `http.ts`, `fetch.ts`, `tracing.ts`).
 *
 * The OTLP exporters read `OTEL_EXPORTER_OTLP_ENDPOINT` from the environment
 * (default `http://localhost:4318`); in the lab that points at Grafana Alloy.
 */
export function initTelemetry(service: ServiceInfo): void {
  if (started) return;
  current = service;

  const exportIntervalMs = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS ?? "10000");

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: service.name,
      [ATTR_SERVICE_VERSION]: service.version,
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: exportIntervalMs,
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    // Bun's async_hooks createHook is incomplete; AsyncLocalStorage is reliable,
    // so pin the ALS context manager explicitly rather than trust the default.
    contextManager: new AsyncLocalStorageContextManager(),
    textMapPropagator: new W3CTraceContextPropagator(),
    instrumentations: [],
  });

  sdk.start();
  started = true;

  const shutdown = (): void => {
    void sdk
      .shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

/** The service identity passed to {@link initTelemetry}. */
export function serviceInfo(): ServiceInfo {
  return current;
}
