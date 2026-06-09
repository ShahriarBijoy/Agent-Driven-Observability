import type {
  AgentKind,
  AgentRun,
  AgentStreamEvent,
  Approval,
  RunMessage,
  ToolCall,
} from "@obs/contracts";

/**
 * In-memory run store + placeholder echo agent.
 *
 * Phase 4 needs a real streaming surface before the real agents exist
 * (Phase 5). The echo agent exercises every part of the pipeline the real
 * agent-service will use: run lifecycle, SSE token streaming, tool-call
 * events, artifacts, and approval gates. Runs live in module state (survives
 * HMR via globalThis) and evaporate on restart — by design.
 */

declare global {
  var __obsRuns: Map<string, AgentRun> | undefined;
}

const runs = (globalThis.__obsRuns ??= new Map<string, AgentRun>());

let counter = runs.size;

function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function listRuns(tenant?: string): AgentRun[] {
  const all = [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return tenant === undefined ? all : all.filter((r) => r.tenant === tenant);
}

export function getRun(id: string): AgentRun | null {
  return runs.get(id) ?? null;
}

export function decideApproval(
  runId: string,
  approvalId: string,
  decision: "approved" | "denied",
): AgentRun | null {
  const run = runs.get(runId);
  if (run === undefined) return null;
  const approval = run.approvals.find((a) => a.id === approvalId);
  if (approval === undefined || approval.decision !== undefined) return run;
  approval.decision = decision;
  approval.decidedAt = now();
  run.status = decision === "approved" ? "completed" : "denied";
  run.updatedAt = now();
  if (decision === "approved") {
    run.messages.push({
      id: newId("msg"),
      role: "assistant",
      content:
        "Approval received — proceeding. (The echo agent has nothing real to execute; Phase 5 agents will.)",
      createdAt: now(),
    });
  }
  return run;
}

export interface StartedRun {
  run: AgentRun;
  events: AsyncGenerator<AgentStreamEvent>;
}

/**
 * Start (or continue) an echo run. Returns the run plus the event stream the
 * SSE route forwards to the browser. Saying "request approval" anywhere in
 * the message demonstrates the approval gate.
 */
export function startEchoTurn(opts: {
  agent: AgentKind;
  tenant: string;
  runId?: string;
  message: string;
}): StartedRun {
  const existing = opts.runId !== undefined ? runs.get(opts.runId) : undefined;
  const run: AgentRun = existing ?? {
    id: newId("run"),
    agent: opts.agent,
    tenant: opts.tenant,
    status: "queued",
    title: opts.message.slice(0, 80),
    createdAt: now(),
    updatedAt: now(),
    messages: [],
    toolCalls: [],
    artifacts: [],
    approvals: [],
  };
  runs.set(run.id, run);

  const userMessage: RunMessage = {
    id: newId("msg"),
    role: "user",
    content: opts.message,
    createdAt: now(),
  };
  run.messages.push(userMessage);
  run.status = "running";
  run.updatedAt = now();

  return { run, events: echoTurn(run, opts.message) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* echoTurn(run: AgentRun, message: string): AsyncGenerator<AgentStreamEvent> {
  yield { type: "run", runId: run.id };

  // A staged tool call so the timeline UI has something true to render.
  const tool: ToolCall = {
    id: newId("tool"),
    name: "telemetry.instant_query",
    args: { promql: `sum(rate(request_duration_seconds_count{service="gateway"}[5m]))` },
    status: "pending",
    startedAt: now(),
  };
  run.toolCalls.push(tool);
  yield { type: "tool_call", toolCall: { ...tool } };
  await sleep(350);
  tool.status = "ok";
  tool.endedAt = now();
  tool.result = "echo agent: query simulated (real tools arrive in Phase 5)";
  yield { type: "tool_call", toolCall: { ...tool } };

  if (/request approval/i.test(message)) {
    const approval: Approval = {
      id: newId("apr"),
      summary: "Echo agent requests permission to take a (pretend) remediation action.",
      requestedAt: now(),
    };
    run.approvals.push(approval);
    run.status = "awaiting_approval";
    run.updatedAt = now();
    yield { type: "approval_required", approval };
    yield { type: "done", runId: run.id, status: run.status };
    return;
  }

  const reply =
    `You said: "${message}". I am the Phase-4 echo agent — a stand-in that proves ` +
    `the streaming path (SSE tokens, tool calls, approvals) before the real agents ` +
    `arrive in Phase 5. Try sending "request approval" to see the approval gate.`;

  let assembled = "";
  for (const word of reply.split(" ")) {
    assembled += (assembled === "" ? "" : " ") + word;
    yield { type: "token", text: (assembled === word ? "" : " ") + word };
    await sleep(24);
  }

  run.messages.push({
    id: newId("msg"),
    role: "assistant",
    content: assembled,
    createdAt: now(),
  });
  run.artifacts.push({
    id: newId("art"),
    name: "echo-summary.md",
    mediaType: "text/markdown",
    content: `# Echo run\n\n- run: \`${run.id}\`\n- tenant: \`${run.tenant}\`\n\n> ${message}\n`,
  });
  run.status = "completed";
  run.updatedAt = now();
  yield { type: "done", runId: run.id, status: run.status };
}
