/**
 * Server-side configuration for the BFF. Defaults target the local compose
 * stack; override via .env when ports move.
 */
export const serverEnv = {
  mimirUrl: process.env["MIMIR_URL"] ?? "http://localhost:9009",
  databaseUrl: process.env["DATABASE_URL"] ?? "postgres://lab:lab@localhost:5432/observability_lab",
  gatewayUrl: process.env["GATEWAY_URL"] ?? "http://localhost:8080",
  /**
   * Phase-5 agent-service (host-run). 127.0.0.1, not localhost: the service is
   * uvicorn on IPv4, and on Windows `localhost` can resolve to IPv6 (::1) first,
   * which would refuse the BFF's server-side fetch.
   */
  agentServiceUrl: process.env["AGENT_SERVICE_URL"] ?? "http://127.0.0.1:8093",
  /** Fixed dev credentials (ADR-002): the `acme` tenant's bearer token. */
  devToken: process.env["DEV_TOKEN"] ?? "dev-local-token",
  devTenant: process.env["DEV_TENANT"] ?? "acme",
  /**
   * Shared secret for agent-service's state-changing endpoints (PLAN-2 P7).
   * `obs web` exports it from the host .env; without it, approve/settings
   * calls are rejected by the service (which is the point).
   */
  obsToken: process.env["OBS_TOKEN"] ?? "",
} as const;
