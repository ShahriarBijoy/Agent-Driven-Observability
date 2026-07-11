import type { AgentRun, Approval, RunMessage, ToolCall } from "@obs/contracts";

/**
 * One entry in the interleaved run transcript. The run detail page builds
 * these from a persisted run via buildRunFeed; the live chat page builds the
 * same shape incrementally from stream events, so both render identically.
 */
export type RunFeedPart =
  | { kind: "message"; message: RunMessage }
  | { kind: "tool"; toolCall: ToolCall }
  | { kind: "approval"; approval: Approval };

// Tie-break for identical timestamps: the agent-service flushes narration
// *before* it starts the tool call, and approvals are requested from inside a
// running tool — so message < tool < approval within the same millisecond.
const KIND_RANK: Record<RunFeedPart["kind"], number> = {
  message: 0,
  tool: 1,
  approval: 2,
};

function timestampOf(part: RunFeedPart): number {
  switch (part.kind) {
    case "message":
      return Date.parse(part.message.createdAt);
    case "tool":
      return Date.parse(part.toolCall.startedAt);
    case "approval":
      return Date.parse(part.approval.requestedAt);
  }
}

/**
 * Merge a run's messages, tool calls, and approvals into one chronological
 * feed. Sort is stable, so same-kind entries keep their original array order.
 * Artifacts carry no timestamp and are rendered after the feed by the caller.
 */
export function buildRunFeed(
  run: Pick<AgentRun, "messages" | "toolCalls" | "approvals">,
): RunFeedPart[] {
  const parts: RunFeedPart[] = [
    ...run.messages.map((message): RunFeedPart => ({ kind: "message", message })),
    ...run.toolCalls.map((toolCall): RunFeedPart => ({ kind: "tool", toolCall })),
    ...run.approvals.map((approval): RunFeedPart => ({ kind: "approval", approval })),
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
  }
}
