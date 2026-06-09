import type { AgentKind } from "@obs/contracts";

/**
 * The permission matrix the Phase-5 agents will be held to (PLAN §p5).
 * Static and display-only for now; agent-service enforces it later.
 */
export interface AgentPermission {
  agent: AgentKind;
  description: string;
  tools: string[];
  needsApproval: boolean;
}

export const AGENT_PERMISSIONS: AgentPermission[] = [
  {
    agent: "echo",
    description: "Phase-4 placeholder; proves the streaming and approval plumbing.",
    tools: ["telemetry.instant_query (simulated)"],
    needsApproval: false,
  },
  {
    agent: "rca",
    description: "Root-cause assistant; read-only over the telemetry plane.",
    tools: ["telemetry.query", "traces.search", "logs.search", "lineage.read"],
    needsApproval: false,
  },
  {
    agent: "incident-reporter",
    description: "Writes postmortems to Postgres when SLO burn alerts fire.",
    tools: ["telemetry.query", "traces.search", "incidents.write"],
    needsApproval: false,
  },
  {
    agent: "auto-fixer",
    description: "Proposes and applies remediations. Every mutation gated.",
    tools: ["telemetry.query", "compose.restart", "config.patch"],
    needsApproval: true,
  },
  {
    agent: "dashboard-generator",
    description: "Generates Grafana dashboards from PromQL it derives.",
    tools: ["telemetry.query", "grafana.dashboards.write"],
    needsApproval: true,
  },
  {
    agent: "runbook-executor",
    description: "Executes runbooks/*.md step by step; pauses before mutations.",
    tools: ["runbooks.read", "compose.restart", "telemetry.query"],
    needsApproval: true,
  },
];
