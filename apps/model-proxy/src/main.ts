import { loadConfig } from "./platform/config";
import { createApp } from "./platform/http";
import { mountCompleteSlice } from "./slices/complete/slice";

const config = loadConfig();

const app = createApp("model-proxy");
mountCompleteSlice(app, { faults: config.faults });

console.log(
  `[model-proxy] listening on :${config.port} (faults=${config.faults.faultsEnabled ? "on" : "off"})`,
);

export default { port: config.port, fetch: app.fetch };
