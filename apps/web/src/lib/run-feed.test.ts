import type { Approval, Artifact, RunMessage, ToolCall } from "@obs/contracts";
import { describe, expect, it } from "vitest";
import { buildRunFeed, feedBlockKey, feedPartKey, groupRunFeed } from "./run-feed";

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

function artifact(
  id: string,
  createdAt: string,
  mediaType: Artifact["mediaType"] = "text/html",
): Artifact {
  return { id, name: `${id}.html`, mediaType, content: "<h1>x</h1>", createdAt };
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
      artifacts: [],
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
      artifacts: [],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-seg", "t-1"]);
  });

  it("renders old blob-style runs as tools first, then the single message", () => {
    // Pre-split runs stored one assistant message at end-of-turn.
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0)), msg("m-blob", "assistant", at(20))],
      toolCalls: [tool("t-1", at(2)), tool("t-2", at(4)), tool("t-3", at(6))],
      approvals: [],
      artifacts: [],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-user", "t-1", "t-2", "t-3", "m-blob"]);
  });

  it("keeps same-kind entries in original order on equal timestamps", () => {
    const feed = buildRunFeed({
      messages: [],
      toolCalls: [tool("t-a", at(1)), tool("t-b", at(1)), tool("t-c", at(1))],
      approvals: [],
      artifacts: [],
    });
    expect(feed.map(feedPartKey)).toEqual(["t-a", "t-b", "t-c"]);
  });

  it("includes pending tool calls and interleaves approvals after their tool", () => {
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0))],
      toolCalls: [tool("t-gate", at(3), "pending")],
      approvals: [approval("a-1", at(3))],
      artifacts: [],
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
      artifacts: [],
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

  it("interleaves artifacts chronologically", () => {
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0)), msg("m-final", "assistant", at(9))],
      toolCalls: [tool("t-save", at(5))],
      approvals: [],
      artifacts: [artifact("art-1", at(7))],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-user", "t-save", "art-1", "m-final"]);
  });

  it("puts an artifact after the tool call that produced it on equal timestamps", () => {
    const feed = buildRunFeed({
      messages: [],
      toolCalls: [tool("t-save", at(5))],
      approvals: [],
      artifacts: [artifact("art-1", at(5))],
    });
    expect(feed.map(feedPartKey)).toEqual(["t-save", "art-1"]);
  });
});

describe("groupRunFeed", () => {
  it("collapses consecutive tool calls into one tools block", () => {
    const feed = buildRunFeed({
      messages: [
        msg("m-user", "user", at(0)),
        msg("m-seg", "assistant", at(1)),
        msg("m-final", "assistant", at(9)),
      ],
      toolCalls: [tool("t-1", at(2)), tool("t-2", at(3)), tool("t-3", at(4))],
      approvals: [],
      artifacts: [],
    });
    const blocks = groupRunFeed(feed);
    expect(blocks.map((b) => b.kind)).toEqual(["message", "message", "tools", "message"]);
    const tools = blocks[2];
    if (tools?.kind !== "tools") throw new Error("expected tools block");
    expect(tools.toolCalls.map((tc) => tc.id)).toEqual(["t-1", "t-2", "t-3"]);
  });

  it("keeps tool runs separated by narration as distinct blocks", () => {
    const feed = buildRunFeed({
      messages: [msg("m-seg", "assistant", at(3))],
      toolCalls: [tool("t-1", at(1)), tool("t-2", at(5))],
      approvals: [],
      artifacts: [],
    });
    const blocks = groupRunFeed(feed);
    expect(blocks.map((b) => b.kind)).toEqual(["tools", "message", "tools"]);
  });

  it("breaks a tool group on approvals but not on artifacts", () => {
    const feed = buildRunFeed({
      messages: [],
      toolCalls: [tool("t-1", at(1)), tool("t-gate", at(2), "pending"), tool("t-2", at(5))],
      approvals: [approval("a-1", at(3))],
      artifacts: [artifact("art-1", at(4))],
    });
    const blocks = groupRunFeed(feed);
    // The artifact hoists to the end of the turn, so t-2 merges into a group
    // with what follows the approval; artifacts render after everything else.
    expect(blocks.map((b) => b.kind)).toEqual(["tools", "approval", "tools", "artifact"]);
  });

  it("hoists artifacts after the turn's closing message", () => {
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0)), msg("m-final", "assistant", at(9))],
      toolCalls: [tool("t-save", at(5))],
      approvals: [],
      artifacts: [artifact("art-1", at(7))],
    });
    const blocks = groupRunFeed(feed);
    expect(blocks.map(feedBlockKey)).toEqual(["m-user", "t-save", "m-final", "art-1"]);
  });

  it("keeps hoisted artifacts within their own turn on multi-turn runs", () => {
    const feed = buildRunFeed({
      messages: [
        msg("m-u1", "user", at(0)),
        msg("m-a1", "assistant", at(5)),
        msg("m-u2", "user", at(10)),
        msg("m-a2", "assistant", at(15)),
      ],
      toolCalls: [tool("t-1", at(2)), tool("t-2", at(12))],
      approvals: [],
      artifacts: [artifact("art-turn1", at(3)), artifact("art-turn2", at(13))],
    });
    const blocks = groupRunFeed(feed);
    expect(blocks.map(feedBlockKey)).toEqual([
      "m-u1",
      "t-1",
      "m-a1",
      "art-turn1",
      "m-u2",
      "t-2",
      "m-a2",
      "art-turn2",
    ]);
  });

  it("merges tool calls separated only by an artifact into one group", () => {
    const feed = buildRunFeed({
      messages: [],
      toolCalls: [tool("t-1", at(1)), tool("t-2", at(5))],
      approvals: [],
      artifacts: [artifact("art-1", at(3))],
    });
    const blocks = groupRunFeed(feed);
    expect(blocks.map((b) => b.kind)).toEqual(["tools", "artifact"]);
    const tools = blocks[0];
    if (tools?.kind !== "tools") throw new Error("expected tools block");
    expect(tools.toolCalls.map((tc) => tc.id)).toEqual(["t-1", "t-2"]);
  });

  it("keys a tools block by its first tool call and passes others through", () => {
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0))],
      toolCalls: [tool("t-1", at(1)), tool("t-2", at(2))],
      approvals: [],
      artifacts: [],
    });
    const blocks = groupRunFeed(feed);
    expect(blocks.map(feedBlockKey)).toEqual(["m-user", "t-1"]);
  });
});
