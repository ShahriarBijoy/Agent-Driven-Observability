/**
 * Server-side configuration for the BFF. Defaults target the local compose
 * stack; override via .env when ports move.
 */
export const serverEnv = {
  mimirUrl: process.env["MIMIR_URL"] ?? "http://localhost:9009",
  databaseUrl: process.env["DATABASE_URL"] ?? "postgres://lab:lab@localhost:5432/observability_lab",
  gatewayUrl: process.env["GATEWAY_URL"] ?? "http://localhost:8080",
  /** Phase-5 agent-service; unused while the echo agent lives in the BFF. */
  agentServiceUrl: process.env["AGENT_SERVICE_URL"] ?? "http://localhost:8090",
  /** Fixed dev credentials (ADR-002): the `acme` tenant's bearer token. */
  devToken: process.env["DEV_TOKEN"] ?? "dev-local-token",
  devTenant: process.env["DEV_TENANT"] ?? "acme",
} as const;
