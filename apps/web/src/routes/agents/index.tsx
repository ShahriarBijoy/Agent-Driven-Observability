import type { Approval, ToolCall } from "@obs/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowUpIcon, BotIcon, CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Markdown } from "~/components/markdown";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
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
import { Message, MessageContent } from "~/components/ui/message";
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
import { cn } from "~/lib/utils";
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
        body: JSON.stringify({ agent: "rca", tenant, runId: runIdRef.current, message }),
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

  const isEmpty = transcript.length === 0 && streamText === null;

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
                <MessageScrollerContent className="px-4 py-5">
                  {isEmpty ? (
                    <Empty className="my-auto border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <BotIcon />
                        </EmptyMedia>
                        <EmptyTitle>Ask the RCA assistant</EmptyTitle>
                        <EmptyDescription>
                          Ask why something is happening. The assistant runs real Loki, Tempo,
                          Mimir, and Postgres queries, shows them live in the tool timeline, and
                          answers from what it finds.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    transcript.map((entry) => (
                      <MessageScrollerItem
                        key={entry.id}
                        messageId={`msg-${entry.id}`}
                        scrollAnchor={entry.role === "user"}
                      >
                        <ChatMessage entry={entry} />
                      </MessageScrollerItem>
                    ))
                  )}

                  {streamText !== null ? (
                    <MessageScrollerItem messageId="msg-streaming">
                      {streamText === "" ? (
                        <Marker role="status">
                          <MarkerIcon>
                            <Spinner />
                          </MarkerIcon>
                          <MarkerContent>Investigating…</MarkerContent>
                        </Marker>
                      ) : (
                        <ChatMessage
                          streaming
                          entry={{ id: -1, role: "assistant", content: streamText }}
                        />
                      )}
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
        <Card size="sm" className="panel-rise panel-rise-2 max-h-72 min-h-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Tool calls
              {busy ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 overflow-y-auto">
            {toolCalls.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tool activity for this conversation appears here.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {toolCalls.map((tc) => (
                  <div key={tc.id} className="min-w-0">
                    <Marker>
                      <MarkerIcon>
                        {tc.status === "ok" ? (
                          <CheckIcon className="text-success" />
                        ) : tc.status === "error" ? (
                          <XIcon className="text-destructive" />
                        ) : (
                          <Spinner />
                        )}
                      </MarkerIcon>
                      <MarkerContent className="truncate font-mono text-xs">
                        {tc.name}
                      </MarkerContent>
                    </Marker>
                    {tc.result !== undefined ? (
                      <p className="mt-0.5 line-clamp-2 pl-6 text-xs text-muted-foreground/80">
                        {tc.result}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="panel-rise panel-rise-3 min-h-0 flex-1">
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

function ChatMessage({
  entry,
  streaming = false,
}: {
  entry: TranscriptEntry;
  streaming?: boolean;
}) {
  if (entry.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end">
            <BubbleContent className="whitespace-pre-wrap">{entry.content}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message>
      <MessageContent>
        <Bubble variant="ghost">
          <BubbleContent>
            <Markdown className={cn("typeset-chat", streaming && "stream-caret")}>
              {entry.content}
            </Markdown>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
