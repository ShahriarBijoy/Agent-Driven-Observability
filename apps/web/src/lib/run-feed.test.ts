import type { Approval, RunMessage, ToolCall } from "@obs/contracts";
import { describe, expect, it } from "vitest";
import { buildRunFeed, feedPartKey } from "./run-feed";

const at = (seconds: number, ms = 0) =>
  new Date(Date.UTC(2026, 6, 11, 10, 0, seconds, ms)).toISOString();

function msg(id: string, role: RunMessage["role"], createdAt: string): RunMessage {
  return { id, role, content: `content ${id}`, createdAt };
}

function tool(id: string, startedAt: string, status: ToolCall["status"] = "ok"): ToolCall {
  return {
    id,
    name: "mimir_query",
    args: { query: "up" },
    status,
    startedAt,
    ...(status === "pending" ? {} : { endedAt: startedAt, result: "ok" }),
  };
}

function approval(id: string, requestedAt: string): Approval {
  return { id, summary: `approve ${id}`, requestedAt };
}

describe("buildRunFeed", () => {
  it("interleaves narration segments and tool calls chronologically", () => {
    const feed = buildRunFeed({
      messages: [
        msg("m-user", "user", at(0)),
        msg("m-seg1", "assistant", at(2)),
        msg("m-seg2", "assistant", at(5)),
        msg("m-final", "assistant", at(9)),
      ],
      toolCalls: [tool("t-1", at(3)), tool("t-2", at(6))],
      approvals: [],
    });
    expect(feed.map(feedPartKey)).toEqual([
      "m-user",
      "m-seg1",
      "t-1",
      "m-seg2",
      "t-2",
      "m-final",
    ]);
  });

  it("puts a message before a tool call with the identical timestamp", () => {
    const feed = buildRunFeed({
      messages: [msg("m-seg", "assistant", at(1, 500))],
      toolCalls: [tool("t-1", at(1, 500))],
      approvals: [],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-seg", "t-1"]);
  });

  it("renders old blob-style runs as tools first, then the single message", () => {
    // Pre-split runs stored one assistant message at end-of-turn.
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0)), msg("m-blob", "assistant", at(20))],
      toolCalls: [tool("t-1", at(2)), tool("t-2", at(4)), tool("t-3", at(6))],
      approvals: [],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-user", "t-1", "t-2", "t-3", "m-blob"]);
  });

  it("keeps same-kind entries in original order on equal timestamps", () => {
    const feed = buildRunFeed({
      messages: [],
      toolCalls: [tool("t-a", at(1)), tool("t-b", at(1)), tool("t-c", at(1))],
      approvals: [],
    });
    expect(feed.map(feedPartKey)).toEqual(["t-a", "t-b", "t-c"]);
  });

  it("includes pending tool calls and interleaves approvals after their tool", () => {
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0))],
      toolCalls: [tool("t-gate", at(3), "pending")],
      approvals: [approval("a-1", at(3))],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-user", "t-gate", "a-1"]);
  });

  it("handles multi-turn runs across user messages", () => {
    const feed = buildRunFeed({
      messages: [
        msg("m-u1", "user", at(0)),
        msg("m-a1", "assistant", at(5)),
        msg("m-u2", "user", at(10)),
        msg("m-a2", "assistant", at(15)),
      ],
      toolCalls: [tool("t-turn1", at(2)), tool("t-turn2", at(12))],
      approvals: [],
    });
    expect(feed.map(feedPartKey)).toEqual([
      "m-u1",
      "t-turn1",
      "m-a1",
      "m-u2",
      "t-turn2",
      "m-a2",
    ]);
  });
});
