import {
  AgentRunSchema,
  AgentRunSummarySchema,
  AgentSettingsSchema,
  ExamResultSchema,
  ExamRunSchema,
  type AgentRun,
  type AgentRunSummary,
  type AgentSettings,
  type AgentSettingsUpdate,
  type ApprovalDecisionRequest,
  type ExamResult,
  type ExamRun,
} from "@obs/contracts";
import { z } from "zod";
import { serverEnv } from "./env";

/**
 * Typed client for the agent-service API — the BFF seam.
 *
 * Phase 5: each call is a fetch against `serverEnv.agentServiceUrl`, validated
 * against @obs/contracts so the boundary can't silently widen. The service may
 * be down (it runs on the host for live Claude auth), so reads degrade to
 * empty/null rather than throwing — the control plane stays renderable.
 */

const base = serverEnv.agentServiceUrl;

export async function listAgentRuns(tenant?: string): Promise<AgentRunSummary[]> {
  const url = new URL("/runs", base);
  if (tenant !== undefined) url.searchParams.set("tenant", tenant);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    return z.array(AgentRunSummarySchema).parse(await res.json());
  } catch {
    return [];
  }
}

export async function getAgentRun(id: string): Promise<AgentRun | null> {
  try {
    const res = await fetch(new URL(`/runs/${encodeURIComponent(id)}`, base));
    if (!res.ok) return null;
    return AgentRunSchema.parse(await res.json());
  } catch {
    return null;
  }
}

export async function getAgentSettings(): Promise<AgentSettings | null> {
  try {
    const res = await fetch(new URL("/settings", base), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return AgentSettingsSchema.parse(await res.json());
  } catch {
    return null;
  }
}

export async function updateAgentSettings(
  update: AgentSettingsUpdate,
): Promise<AgentSettings | null> {
  try {
    const res = await fetch(new URL("/settings", base), {
      method: "PUT",
      headers: { "content-type": "application/json", "x-obs-token": serverEnv.obsToken },
      body: JSON.stringify(update),
    });
    if (!res.ok) return null;
    return AgentSettingsSchema.parse(await res.json());
  } catch {
    return null;
  }
}

/**
 * The chaos exam (P12). Reads only — the rows are written by
 * `scripts/exam.ps1`, never from the browser: a scorecard that could edit its
 * own grades would not be worth reading.
 */

export async function listExamRuns(limit = 50): Promise<ExamRun[]> {
  const url = new URL("/exam/runs", base);
  url.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    return z.array(ExamRunSchema).parse(await res.json());
  } catch {
    return [];
  }
}

/** Every result row, or one run's when `examRunId` is given. */
export async function listExamResults(examRunId?: string): Promise<ExamResult[]> {
  const url = new URL("/exam/results", base);
  if (examRunId !== undefined) url.searchParams.set("examRunId", examRunId);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    return z.array(ExamResultSchema).parse(await res.json());
  } catch {
    return [];
  }
}

const RunAcceptedSchema = z.object({ runId: z.string() });

/** POST one of the triggered-run endpoints; returns the accepted runId or null. */
async function startTriggeredRun(
  path: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch(new URL(path, base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return RunAcceptedSchema.parse(await res.json()).runId;
  } catch {
    return null;
  }
}

export async function executeRunbook(name: string, tenant: string): Promise<string | null> {
  return startTriggeredRun(`/runbooks/${encodeURIComponent(name)}/execute`, { tenant });
}

export async function startAutoFix(req: {
  tenant: string;
  errorPattern: string;
  hint: string;
}): Promise<string | null> {
  // agent-service's AutoFixRequest is snake_case (FastAPI/pydantic).
  return startTriggeredRun("/auto-fix", {
    tenant: req.tenant,
    error_pattern: req.errorPattern,
    hint: req.hint,
  });
}

export async function submitApprovalDecision(
  req: ApprovalDecisionRequest,
): Promise<AgentRun | null> {
  try {
    const res = await fetch(new URL(`/runs/${encodeURIComponent(req.runId)}/approve`, base), {
      method: "POST",
      headers: { "content-type": "application/json", "x-obs-token": serverEnv.obsToken },
      body: JSON.stringify({ approvalId: req.approvalId, decision: req.decision }),
    });
    if (!res.ok) return null;
    return AgentRunSchema.parse(await res.json());
  } catch {
    return null;
  }
}
