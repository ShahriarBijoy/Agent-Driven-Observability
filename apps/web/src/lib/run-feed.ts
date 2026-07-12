import type { AgentRun, Approval, Artifact, RunMessage, ToolCall } from "@obs/contracts";

/**
 * One entry in the interleaved run transcript. The run detail page builds
 * these from a persisted run via buildRunFeed; the live chat page builds the
 * same shape incrementally from stream events, so both render identically.
 */
export type RunFeedPart =
  | { kind: "message"; message: RunMessage }
  | { kind: "tool"; toolCall: ToolCall }
  | { kind: "approval"; approval: Approval }
  | { kind: "artifact"; artifact: Artifact };

// Tie-break for identical timestamps: the agent-service flushes narration
// *before* it starts the tool call, approvals are requested from inside a
// running tool, and artifacts are produced by a tool — so message < tool <
// approval < artifact within the same millisecond.
const KIND_RANK: Record<RunFeedPart["kind"], number> = {
  message: 0,
  tool: 1,
  approval: 2,
  artifact: 3,
};

function timestampOf(part: RunFeedPart): number {
  switch (part.kind) {
    case "message":
      return Date.parse(part.message.createdAt);
    case "tool":
      return Date.parse(part.toolCall.startedAt);
    case "approval":
      return Date.parse(part.approval.requestedAt);
    case "artifact":
      return Date.parse(part.artifact.createdAt);
  }
}

/**
 * Merge a run's messages, tool calls, approvals, and artifacts into one
 * chronological feed. Sort is stable, so same-kind entries keep their
 * original array order.
 */
export function buildRunFeed(
  run: Pick<AgentRun, "messages" | "toolCalls" | "approvals" | "artifacts">,
): RunFeedPart[] {
  const parts: RunFeedPart[] = [
    ...run.messages.map((message): RunFeedPart => ({ kind: "message", message })),
    ...run.toolCalls.map((toolCall): RunFeedPart => ({ kind: "tool", toolCall })),
    ...run.approvals.map((approval): RunFeedPart => ({ kind: "approval", approval })),
    ...run.artifacts.map((artifact): RunFeedPart => ({ kind: "artifact", artifact })),
  ];
  return parts.sort(
    (a, b) => timestampOf(a) - timestampOf(b) || KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
}

export function feedPartKey(part: RunFeedPart): string {
  switch (part.kind) {
    case "message":
      return part.message.id;
    case "tool":
      return part.toolCall.id;
    case "approval":
      return part.approval.id;
    case "artifact":
      return part.artifact.id;
  }
}

/**
 * What the pages actually render: a feed where consecutive tool calls are
 * folded into one "tools" block (shown collapsed as "N tool calls") and
 * artifacts are hoisted to the end of their turn — the deliverable reads
 * after the conclusion, not buried mid-process. Messages and approvals pass
 * through in order.
 */
export type RunFeedBlock =
  | Exclude<RunFeedPart, { kind: "tool" }>
  | { kind: "tools"; toolCalls: ToolCall[] };

/** Group tool calls and hoist artifacts per turn. Pure; safe to run per render. */
export function groupRunFeed(parts: RunFeedPart[]): RunFeedBlock[] {
  const blocks: RunFeedBlock[] = [];
  // Artifacts created during the current turn; emitted when the turn ends
  // (next user message) or the feed runs out.
  let turnArtifacts: RunFeedBlock[] = [];

  function endTurn() {
    blocks.push(...turnArtifacts);
    turnArtifacts = [];
  }

  for (const part of parts) {
    if (part.kind === "artifact") {
      turnArtifacts.push(part);
      continue;
    }
    if (part.kind === "message" && part.message.role === "user") endTurn();
    if (part.kind !== "tool") {
      blocks.push(part);
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === "tools") {
      last.toolCalls.push(part.toolCall); // local array created below — not shared state
    } else {
      blocks.push({ kind: "tools", toolCalls: [part.toolCall] });
    }
  }
  endTurn();
  return blocks;
}

/** Stable React key: a tools block is keyed by its first call, which never changes. */
export function feedBlockKey(block: RunFeedBlock): string {
  return block.kind === "tools" ? block.toolCalls[0]!.id : feedPartKey(block);
}
