import { z } from "zod";

/**
 * Contracts for the agent surfaces (Phase 4 web UI ↔ agent-service).
 *
 * Phase 4 ships the web control plane against a placeholder echo agent that
 * lives in the web BFF; Phase 5 replaces that with the real agent-service.
 * These schemas are the boundary both sides must keep honoring.
 */

export const AgentKindSchema = z.enum([
  "echo", // Phase-4 placeholder; exercises the full streaming path
  "rca",
  "incident-reporter",
  "auto-fixer",
  "dashboard-generator",
  "runbook-executor",
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "denied",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  // JSON values, not unknown — server functions must return serializable types.
  args: z.record(z.string(), z.json()),
  status: z.enum(["pending", "ok", "error"]),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().optional(),
  /** Tool output, truncated for display; full output lives in artifacts. */
  result: z.string().optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const RunMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
export type RunMessage = z.infer<typeof RunMessageSchema>;

export const ArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.enum(["text/markdown", "application/json", "text/html"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  /** What the agent wants to do, in one operator-readable sentence. */
  summary: z.string(),
  requestedAt: z.iso.datetime(),
  decision: z.enum(["approved", "denied"]).optional(),
  decidedAt: z.iso.datetime().optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  agent: AgentKindSchema,
  tenant: z.string(),
  status: RunStatusSchema,
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  messages: z.array(RunMessageSchema),
  toolCalls: z.array(ToolCallSchema),
  artifacts: z.array(ArtifactSchema),
  approvals: z.array(ApprovalSchema),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const AgentRunSummarySchema = AgentRunSchema.pick({
  id: true,
  agent: true,
  tenant: true,
  status: true,
  title: true,
  createdAt: true,
  updatedAt: true,
});
export type AgentRunSummary = z.infer<typeof AgentRunSummarySchema>;

/**
 * POST /agents/chat request body. Omitting `runId` starts a fresh run.
 * ("Agent" prefix: gateway.ts already owns the bare ChatRequest name.)
 */
export const AgentChatRequestSchema = z.object({
  agent: AgentKindSchema.default("echo"),
  tenant: z.string().min(1),
  runId: z.string().optional(),
  message: z.string().min(1).max(8_000),
});
export type AgentChatRequest = z.infer<typeof AgentChatRequestSchema>;

/** Events streamed over SSE while a run executes. */
export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run"), runId: z.string() }),
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({ type: z.literal("tool_call"), toolCall: ToolCallSchema }),
  z.object({ type: z.literal("artifact"), artifact: ArtifactSchema }),
  z.object({ type: z.literal("approval_required"), approval: ApprovalSchema }),
  z.object({ type: z.literal("done"), runId: z.string(), status: RunStatusSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export const ApprovalDecisionRequestSchema = z.object({
  runId: z.string(),
  approvalId: z.string(),
  decision: z.enum(["approved", "denied"]),
});
export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequestSchema>;
