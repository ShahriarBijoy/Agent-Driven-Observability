import { AgentRunSchema, type AgentStreamEvent } from "@obs/contracts";
import { describe, expect, it } from "vitest";
import { decideApproval, getRun, startEchoTurn } from "./runs-store";

async function drain(events: AsyncGenerator<AgentStreamEvent>): Promise<AgentStreamEvent[]> {
  const out: AgentStreamEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("echo run store", () => {
  it("streams a full turn: run, tool call, tokens, done — and persists a valid run", async () => {
    const { run, events } = startEchoTurn({
      agent: "echo",
      tenant: "acme",
      message: "hello there",
    });
    const seen = await drain(events);

    expect(seen[0]).toEqual({ type: "run", runId: run.id });
    expect(seen.filter((e) => e.type === "tool_call")).toHaveLength(2); // pending → ok
    expect(seen.filter((e) => e.type === "token").length).toBeGreaterThan(5);
    expect(seen.at(-1)).toEqual({ type: "done", runId: run.id, status: "completed" });

    const stored = getRun(run.id);
    expect(stored).not.toBeNull();
    // The contract is the boundary: a stored run must round-trip the schema.
    expect(() => AgentRunSchema.parse(stored)).not.toThrow();
    expect(stored?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(stored?.artifacts).toHaveLength(1);
  });

  it("pauses at the approval gate and resumes on approval", async () => {
    const { run, events } = startEchoTurn({
      agent: "runbook-executor",
      tenant: "acme",
      message: "execute the runbook — request approval first",
    });
    const seen = await drain(events);

    const approvalEvent = seen.find((e) => e.type === "approval_required");
    expect(approvalEvent).toBeDefined();
    expect(getRun(run.id)?.status).toBe("awaiting_approval");

    const approval = getRun(run.id)!.approvals[0]!;
    const updated = decideApproval(run.id, approval.id, "approved");
    expect(updated?.status).toBe("completed");
    expect(updated?.approvals[0]?.decision).toBe("approved");
  });

  it("denies cleanly and ignores double decisions", async () => {
    const { run, events } = startEchoTurn({
      agent: "auto-fixer",
      tenant: "bravo",
      message: "request approval to restart things",
    });
    await drain(events);

    const approval = getRun(run.id)!.approvals[0]!;
    expect(decideApproval(run.id, approval.id, "denied")?.status).toBe("denied");
    // Second decision is a no-op — the first one stands.
    expect(decideApproval(run.id, approval.id, "approved")?.approvals[0]?.decision).toBe("denied");
  });

  it("continues an existing run when runId is supplied", async () => {
    const first = startEchoTurn({ agent: "echo", tenant: "acme", message: "turn one" });
    await drain(first.events);
    const second = startEchoTurn({
      agent: "echo",
      tenant: "acme",
      runId: first.run.id,
      message: "turn two",
    });
    await drain(second.events);

    expect(second.run.id).toBe(first.run.id);
    expect(getRun(first.run.id)?.messages.filter((m) => m.role === "user")).toHaveLength(2);
  });
});
