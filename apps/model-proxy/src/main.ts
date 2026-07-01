import "./platform/telemetry"; // initialises OpenTelemetry before any app code

import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { mountChaosSlice } from "./slices/chaos/slice";
import { effectiveFaults } from "./slices/chaos/state";
import { mountCompleteSlice } from "./slices/complete/slice";

const config = loadConfig();

// Dev/lab-only runtime fault-control plane (ADR-005). Set CHAOS_CONTROL_ENABLED
// =false to harden the service (drops the /admin/chaos routes entirely).
const chaosEnabled = process.env["CHAOS_CONTROL_ENABLED"] !== "false";

const app = createApp("model-proxy");
mountCompleteSlice(app, {
  faults: config.faults,
  resolveFaults: chaosEnabled ? () => effectiveFaults(config.faults) : undefined,
});
if (chaosEnabled) mountChaosSlice(app, config.faults);

console.log(
  `[model-proxy] listening on :${config.port} ` +
    `(faults=${config.faults.faultsEnabled ? "on" : "off"}, chaos-control=${chaosEnabled ? "on" : "off"})`,
);

export default { port: config.port, fetch: app.fetch };
