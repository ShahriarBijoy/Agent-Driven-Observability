import type { Approval, ToolCall } from "@obs/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowUpIcon, BotIcon, ShieldAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { RunFeedItem } from "~/components/run-feed-item";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Marker, MarkerContent, MarkerIcon } from "~/components/ui/marker";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "~/components/ui/message-scroller";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { feedPartKey, type RunFeedPart } from "~/lib/run-feed";
import { readAgentStream } from "~/lib/sse";
import { tenantStore } from "~/lib/tenant";
import { getAgentRuns } from "~/server/functions";

export const Route = createFileRoute("/agents/")({
  loader: () => getAgentRuns(),
  component: AgentsPage,
});

function AgentsPage() {
  const runsHistory = Route.useLoaderData();
  const router = useRouter();
  const tenant = tenantStore.use();

  // The live transcript is the same part list the run detail page builds from
  // a persisted run — tokens extend the trailing assistant message, tool_call
  // events upsert a tool part in place, so tools appear inline mid-stream.
  const [parts, setParts] = useState<RunFeedPart[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef<string | undefined>(undefined);
  const nextId = useRef(0);

  function pushMessage(role: "user" | "assistant", content: string) {
    setParts((p) => [
      ...p,
      {
        kind: "message",
        message: {
          id: `live-${nextId.current++}`,
          role,
          content,
          createdAt: new Date().toISOString(),
        },
      },
    ]);
  }

  function appendToken(text: string) {
    setParts((p) => {
      const last = p.at(-1);
      if (last?.kind === "message" && last.message.role === "assistant") {
        return [
          ...p.slice(0, -1),
          { kind: "message", message: { ...last.message, content: last.message.content + text } },
        ];
      }
      return [
        ...p,
        {
          kind: "message",
          message: {
            id: `live-${nextId.current++}`,
            role: "assistant",
            content: text,
            createdAt: new Date().toISOString(),
          },
        },
      ];
    });
  }

  function upsertToolCall(toolCall: ToolCall) {
    setParts((p) => {
      const idx = p.findIndex((x) => x.kind === "tool" && x.toolCall.id === toolCall.id);
      if (idx === -1) return [...p, { kind: "tool", toolCall }];
      const next = [...p];
      next[idx] = { kind: "tool", toolCall };
      return next;
    });
  }

  async function send() {
    const message = draft.trim();
    if (message === "" || busy) return;
    setDraft("");
    setBusy(true);
    setApproval(null);
    pushMessage("user", message);

    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: "rca", tenant, runId: runIdRef.current, message }),
      });
      for await (const event of readAgentStream(res)) {
        switch (event.type) {
          case "run":
            runIdRef.current = event.runId;
            break;
          case "token":
            appendToken(event.text);
            break;
          case "tool_call":
            upsertToolCall(event.toolCall);
            break;
          case "approval_required":
            setApproval(event.approval);
            break;
          case "error":
            appendToken(`\n[stream error: ${event.message}]`);
            break;
          case "done":
            break;
        }
      }
    } finally {
      setBusy(false);
      router.invalidate();
    }
  }

  const lastPart = parts.at(-1);
  const isEmpty = parts.length === 0;
  // Nothing streamed back yet for the latest question — show the thinking marker.
  const awaitingFirstEvent =
    busy && lastPart?.kind === "message" && lastPart.message.role === "user";

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-0 flex-col">
        <div className="panel-rise mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-xl font-semibold tracking-tight">Agents</h1>
          <Badge variant="secondary">RCA assistant</Badge>
          <span className="text-xs text-muted-foreground">
            Read-only · Loki · Tempo · Mimir · Postgres
          </span>
        </div>

        <div className="panel-rise panel-rise-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="flex-1">
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-3 px-4 py-5">
                  {isEmpty ? (
                    <Empty className="my-auto border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <BotIcon />
                        </EmptyMedia>
                        <EmptyTitle>Ask the RCA assistant</EmptyTitle>
                        <EmptyDescription>
                          Ask why something is happening. The assistant runs real Loki, Tempo,
                          Mimir, and Postgres queries, shows them inline as it works, and answers
                          from what it finds.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    parts.map((part, i) => (
                      <MessageScrollerItem
                        key={feedPartKey(part)}
                        messageId={feedPartKey(part)}
                        scrollAnchor={part.kind === "message" && part.message.role === "user"}
                      >
                        <RunFeedItem
                          part={part}
                          streaming={
                            busy &&
                            i === parts.length - 1 &&
                            part.kind === "message" &&
                            part.message.role === "assistant"
                          }
                        />
                      </MessageScrollerItem>
                    ))
                  )}

                  {awaitingFirstEvent ? (
                    <MessageScrollerItem messageId="msg-thinking">
                      <Marker role="status">
                        <MarkerIcon>
                          <Spinner />
                        </MarkerIcon>
                        <MarkerContent>Investigating…</MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                  ) : null}

                  {approval !== null ? (
                    <MessageScrollerItem messageId="msg-approval">
                      <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-warning">
                          <ShieldAlertIcon className="size-4" />
                          Approval required
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{approval.summary}</p>
                        {runIdRef.current !== undefined ? (
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            className="mt-2.5"
                            render={
                              <Link
                                to="/agents/runs/$runId"
                                params={{ runId: runIdRef.current }}
                              />
                            }
                          >
                            Decide on the run page
                          </Button>
                        ) : null}
                      </div>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>

            <form
              className="border-t p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
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
                  className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                  rows={2}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-lg"
                  disabled={busy || draft.trim() === ""}
                  aria-label="Send message"
                >
                  {busy ? <Spinner /> : <ArrowUpIcon />}
                </Button>
              </div>
            </form>
          </MessageScrollerProvider>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <Card size="sm" className="panel-rise panel-rise-2 min-h-0 flex-1">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 overflow-y-auto p-0">
            {runsHistory.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="flex flex-col">
                {runsHistory.slice(0, 12).map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/agents/runs/$runId"
                      params={{ runId: r.id }}
                      className="group block rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground/80 group-hover:text-foreground">
                          {r.title}
                        </span>
                        <RunStatusBadge status={r.status} />
                      </span>
                      <span className="text-[11px] text-muted-foreground">
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
