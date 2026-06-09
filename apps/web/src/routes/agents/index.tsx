import type { Approval, ToolCall } from "@obs/contracts";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusDot,
  Textarea,
  cn,
} from "@obs/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
import { readAgentStream } from "~/lib/sse";
import { tenantStore } from "~/lib/tenant";
import { getAgentRuns } from "~/server/functions";

export const Route = createFileRoute("/agents/")({
  loader: () => getAgentRuns(),
  component: AgentsPage,
});

interface TranscriptEntry {
  id: number;
  role: "user" | "assistant";
  content: string;
}

function AgentsPage() {
  const runsHistory = Route.useLoaderData();
  const router = useRouter();
  const tenant = tenantStore.use();

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef<string | undefined>(undefined);
  const nextId = useRef(0);

  async function send() {
    const message = draft.trim();
    if (message === "" || busy) return;
    setDraft("");
    setBusy(true);
    setApproval(null);
    setTranscript((t) => [...t, { id: nextId.current++, role: "user", content: message }]);
    setStreamText("");

    let assembled = "";
    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: "echo", tenant, runId: runIdRef.current, message }),
      });
      for await (const event of readAgentStream(res)) {
        switch (event.type) {
          case "run":
            runIdRef.current = event.runId;
            break;
          case "token":
            assembled += event.text;
            setStreamText(assembled);
            break;
          case "tool_call":
            setToolCalls((calls) => {
              const rest = calls.filter((c) => c.id !== event.toolCall.id);
              return [...rest, event.toolCall].sort((a, b) =>
                a.startedAt.localeCompare(b.startedAt),
              );
            });
            break;
          case "approval_required":
            setApproval(event.approval);
            break;
          case "error":
            assembled += `\n[stream error: ${event.message}]`;
            setStreamText(assembled);
            break;
          case "done":
            break;
        }
      }
    } finally {
      if (assembled !== "") {
        setTranscript((t) => [
          ...t,
          { id: nextId.current++, role: "assistant", content: assembled },
        ]);
      }
      setStreamText(null);
      setBusy(false);
      router.invalidate();
    }
  }

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[1fr_280px]">
      <div className="flex min-h-0 flex-col">
        <div className="panel-rise mb-4 flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-medium text-ink">Agents</h1>
          <Badge tone="data">echo agent</Badge>
          <span className="text-xs text-ink-faint">real agents arrive in Phase 5</span>
        </div>

        <Card className="panel-rise panel-rise-1 flex min-h-0 flex-1 flex-col">
          <CardContent className="flex-1 space-y-4 overflow-y-auto py-4">
            {transcript.length === 0 && streamText === null ? (
              <EmptyState
                title="rca assistant"
                detail='Ask about the system. The placeholder echo agent streams its answer over SSE — send "request approval" to exercise the approval gate.'
              />
            ) : (
              transcript.map((entry) => <ChatBubble key={entry.id} entry={entry} />)
            )}
            {streamText !== null ? (
              <ChatBubble streaming entry={{ id: -1, role: "assistant", content: streamText }} />
            ) : null}
            {approval !== null ? (
              <div className="rounded-sm border border-signal-dim/40 bg-signal/5 px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.12em] text-signal uppercase">
                  approval required
                </p>
                <p className="mt-1 text-sm text-ink-dim">{approval.summary}</p>
                {runIdRef.current !== undefined ? (
                  <Link
                    to="/agents/runs/$runId"
                    params={{ runId: runIdRef.current }}
                    className="mt-2 inline-block font-mono text-[11px] text-signal-dim uppercase hover:text-signal"
                  >
                    decide on the run page →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </CardContent>

          <form
            className="flex gap-2 border-t border-rule-soft p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`Message the RCA assistant as ${tenant}…`}
              className="min-h-10 flex-1"
              rows={2}
            />
            <Button variant="signal" type="submit" disabled={busy || draft.trim() === ""}>
              {busy ? "streaming…" : "send"}
            </Button>
          </form>
        </Card>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <Card className="panel-rise panel-rise-2">
          <CardHeader>
            <CardTitle>Tool calls</CardTitle>
            {busy ? <StatusDot tone="live" /> : null}
          </CardHeader>
          <CardContent className="space-y-2 py-3">
            {toolCalls.length === 0 ? (
              <p className="text-xs text-ink-faint">
                Tool activity for this conversation appears here.
              </p>
            ) : (
              toolCalls.map((tc) => (
                <div
                  key={tc.id}
                  className="rounded-sm border border-rule-soft bg-inset px-2.5 py-2"
                >
                  <p className="flex items-center gap-2 font-mono text-[11px] text-data">
                    <StatusDot
                      tone={tc.status === "ok" ? "good" : tc.status === "error" ? "bad" : "live"}
                    />
                    {tc.name}
                  </p>
                  {tc.result !== undefined ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{tc.result}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="panel-rise panel-rise-3 min-h-0 flex-1 overflow-y-auto">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {runsHistory.length === 0 ? (
              <p className="px-4 py-3 text-xs text-ink-faint">No runs yet.</p>
            ) : (
              <ul>
                {runsHistory.slice(0, 12).map((r) => (
                  <li key={r.id} className="border-b border-rule-soft last:border-0">
                    <Link
                      to="/agents/runs/$runId"
                      params={{ runId: r.id }}
                      className="group block px-4 py-2"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-ink-dim group-hover:text-ink">
                          {r.title}
                        </span>
                        <RunStatusBadge status={r.status} />
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        <TimeAgo iso={r.createdAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChatBubble({ entry, streaming = false }: { entry: TranscriptEntry; streaming?: boolean }) {
  const isUser = entry.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "border border-rule bg-elev text-ink" : "bg-inset text-ink-dim",
        )}
      >
        <p className="mb-1 font-mono text-[9px] tracking-[0.16em] text-ink-faint uppercase">
          {isUser ? "operator" : "echo agent"}
        </p>
        <p className={cn("whitespace-pre-wrap", streaming && "stream-caret")}>{entry.content}</p>
      </div>
    </div>
  );
}
