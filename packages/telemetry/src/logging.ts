import { context, trace } from "@opentelemetry/api";
import { type LogAttributes, type Logger, logs, SeverityNumber } from "@opentelemetry/api-logs";

type Level = "debug" | "info" | "warn" | "error";

const SEVERITY: Record<Level, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export interface AppLogger {
  debug(message: string, attrs?: Record<string, unknown>): void;
  info(message: string, attrs?: Record<string, unknown>): void;
  warn(message: string, attrs?: Record<string, unknown>): void;
  error(message: string, attrs?: Record<string, unknown>): void;
}

/**
 * A structured logger that does two things on every line:
 *   1. writes a JSON record to stdout/stderr (local-dev visibility), and
 *   2. emits an OTel LogRecord (exported via OTLP to Alloy → Loki).
 *
 * Both carry `trace_id`/`span_id` from the active span context, so a log line
 * in Loki links back to its trace in Tempo. The OTel Logs SDK also stamps the
 * trace context onto the exported record automatically; we mirror it into the
 * JSON body so the correlation is visible without a backend too.
 */
export function createLogger(service: string): AppLogger {
  const otelLogger: Logger = logs.getLogger(service);

  const emit = (level: Level, message: string, attrs?: Record<string, unknown>): void => {
    const sc = trace.getSpan(context.active())?.spanContext();

    const line = JSON.stringify({
      level,
      service,
      message,
      trace_id: sc?.traceId,
      span_id: sc?.spanId,
      time: new Date().toISOString(),
      ...attrs,
    });
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);

    otelLogger.emit({
      severityNumber: SEVERITY[level],
      severityText: level.toUpperCase(),
      body: message,
      attributes: attrs as LogAttributes | undefined,
    });
  };

  return {
    debug: (m, a) => emit("debug", m, a),
    info: (m, a) => emit("info", m, a),
    warn: (m, a) => emit("warn", m, a),
    error: (m, a) => emit("error", m, a),
  };
}
