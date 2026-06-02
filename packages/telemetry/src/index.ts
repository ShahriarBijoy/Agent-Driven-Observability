// @obs/telemetry — shared OpenTelemetry wiring + manual-instrumentation helpers
// for the Bun service fleet. See docs/adr/003-application-observability.md.

export { initTelemetry, serviceInfo, type ServiceInfo } from "./init";
export {
  activeTraceIds,
  type Attributes,
  context,
  getTracer,
  type Span,
  SpanKind,
  type SpanOptions,
  SpanStatusCode,
  trace,
  withSpan,
} from "./tracing";
export {
  type Counter,
  createHistogram,
  getMeter,
  type Histogram,
  type Meter,
  type UpDownCounter,
} from "./metrics";
export { type AppLogger, createLogger } from "./logging";
export { honoTelemetry } from "./http";
export { tracedFetch } from "./fetch";
