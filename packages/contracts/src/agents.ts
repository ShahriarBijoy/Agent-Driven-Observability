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
  "gitops-reporter", // P10: Argo CD / Rollouts webhook-triggered delivery reporter
  "auto-fixer",
  "dashboard-generator",
  "runbook-executor",
  "oncall", // P11: the autonomous on-call brain (alert-triggered + chat)
  "judge", // P12: grades an exam report against a hidden key (no tools but submit_grade)
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

/**
 * Runtime agent settings (GET/PUT agent-service /settings). The web settings
 * page selects the Claude model and grants extra tools per agent; agent-service
 * merges grants with each agent's built-in allow-list at run start.
 */

export const AgentModelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
});
export type AgentModelOption = z.infer<typeof AgentModelOptionSchema>;

export const AgentToolInfoSchema = z.object({
  name: z.string(),
  kind: z.enum(["mcp", "builtin"]),
  description: z.string(),
});
export type AgentToolInfo = z.infer<typeof AgentToolInfoSchema>;

export const AgentToolPolicySchema = z.object({
  kind: AgentKindSchema,
  description: z.string(),
  /** bypassPermissions = unattended agent; its guardrail is request_approval. */
  permissionMode: z.enum(["default", "bypassPermissions"]),
  defaultTools: z.array(z.string()),
  grantedTools: z.array(z.string()),
});
export type AgentToolPolicy = z.infer<typeof AgentToolPolicySchema>;

export const AgentSettingsSchema = z.object({
  /** Stored model override; null falls back to env, then the CLI default. */
  model: z.string().nullable(),
  modelSource: z.enum(["settings", "env", "cli"]),
  envModel: z.string().nullable(),
  availableModels: z.array(AgentModelOptionSchema),
  tools: z.array(AgentToolInfoSchema),
  agents: z.array(AgentToolPolicySchema),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/** PUT /settings body; toolGrants replaces the whole grants map. */
export const AgentSettingsUpdateSchema = z.object({
  model: z.string().nullable().optional(),
  toolGrants: z.record(z.string(), z.array(z.string())).optional(),
});
export type AgentSettingsUpdate = z.infer<typeof AgentSettingsUpdateSchema>;

/**
 * The chaos exam (P12) — mirrors `agent_service.models.ExamRun/ExamResult`,
 * which `scripts/exam.ps1` writes and `/scorecard` reads.
 *
 * Every optional field is `.optional()` and never `.nullable()`: agent-service
 * dumps with `exclude_none=True`, so an unset field is ABSENT from the JSON
 * rather than null. A `.nullable()` here would reject the real wire shape.
 */

export const ExamStatusSchema = z.enum([
  "graded", // the agent answered and the judge returned a verdict
  "not_run", // the Claude session died — the question was never asked
  "no_alert", // nothing fired in time: an observability finding, not a wrong answer
  "error", // inject/verify/revert/judge failed; the scenario is unusable
]);
export type ExamStatus = z.infer<typeof ExamStatusSchema>;

/** One invocation of `obs exam` — a group, a single scenario, or `--all`. */
export const ExamRunSchema = z.object({
  id: z.string(),
  group: z.string(),
  startedAt: z.iso.datetime(),
  /** Absent while a run is in flight, and on a run the operator interrupted. */
  finishedAt: z.iso.datetime().optional(),
  // Server-side default is "", so it is always emitted — defaulted here anyway
  // so one odd row can't fail the parse and blank the whole page.
  gitSha: z.string().default(""),
  notes: z.string().optional(),
});
export type ExamRun = z.infer<typeof ExamRunSchema>;

/**
 * One scenario's outcome inside an exam run. Only `scenarioId` and `status`
 * are guaranteed: a row exists even when the question was never asked, and
 * `not_run`/`no_alert`/`error` rows carry no verdict and no score.
 */
export const ExamResultSchema = z.object({
  scenarioId: z.string(),
  status: ExamStatusSchema,
  id: z.string().optional(),
  examRunId: z.string().optional(),
  incidentId: z.string().optional(),
  agentRunId: z.string().optional(),
  judgeRunId: z.string().optional(),
  componentCorrect: z.boolean().optional(),
  causeCategoryCorrect: z.boolean().optional(),
  evidenceCited: z.boolean().optional(),
  remediationAppropriate: z.boolean().optional(),
  /** True collapses `score` to 0 server-side however good the reasoning was. */
  cheated: z.boolean().optional(),
  timeToAlertS: z.number().int().optional(),
  timeToDiagnosisS: z.number().int().optional(),
  turns: z.number().int().optional(),
  toolCalls: z.number().int().optional(),
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  costUsd: z.number().optional(),
  judgeRationale: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
  /**
   * DERIVED server-side from the four booleans (ADR-006: the judge answers
   * booleans and never awards itself a number), so it is absent unless
   * `status` is "graded". 0-4.
   */
  score: z.number().int().min(0).max(4).optional(),
});
export type ExamResult = z.infer<typeof ExamResultSchema>;
