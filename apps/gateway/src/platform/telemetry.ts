import { initTelemetry } from "@obs/telemetry";

// Side-effect module: initialises the OpenTelemetry SDK as the first thing the
// process does. `main.ts` imports this before any other module so providers are
// registered before application code constructs spans, metrics, or loggers.
initTelemetry({ name: "gateway", version: "0.0.0" });
