/**
 * Client-visible endpoints. Everything here reaches the browser, so only
 * local-lab URLs belong — secrets stay in src/server/env.ts.
 */
export const publicConfig = {
  grafanaUrl: import.meta.env["VITE_GRAFANA_URL"] ?? "http://localhost:3001",
  marquezUrl: import.meta.env["VITE_MARQUEZ_URL"] ?? "http://localhost:3002",
} as const;
