import {
  AgentRunSchema,
  AgentRunSummarySchema,
  type AgentRun,
  type AgentRunSummary,
  type ApprovalDecisionRequest,
} from "@obs/contracts";
import * as store from "./runs-store";

/**
 * Typed client for the agent-service API — the BFF seam.
 *
 * Phase 4: backed by the in-memory echo store. Phase 5: each function body
 * becomes a fetch against `serverEnv.agentServiceUrl`, and nothing upstream
 * of this module changes. Outputs are validated against @obs/contracts even
 * now, so the swap can't silently widen the boundary.
 */

export async function listAgentRuns(tenant?: string): Promise<AgentRunSummary[]> {
  return store.listRuns(tenant).map((r) => AgentRunSummarySchema.parse(r));
}

export async function getAgentRun(id: string): Promise<AgentRun | null> {
  const run = store.getRun(id);
  return run === null ? null : AgentRunSchema.parse(run);
}

export async function submitApprovalDecision(
  req: ApprovalDecisionRequest,
): Promise<AgentRun | null> {
  const run = store.decideApproval(req.runId, req.approvalId, req.decision);
  return run === null ? null : AgentRunSchema.parse(run);
}
