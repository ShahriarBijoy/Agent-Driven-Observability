import type { Approval, Artifact, ToolCall } from "@obs/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowUpIcon, BotIcon, LayoutDashboardIcon, ShieldAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Shimmer } from "~/components/ai-elements/shimmer";
import { ArtifactPanel } from "~/components/artifact-panel";
import { RunFeedItem } from "~/components/run-feed-item";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
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
import { feedBlockKey, groupRunFeed, type RunFeedPart } from "~/lib/run-feed";
import { readAgentStream } from "~/lib/sse";
import { tenantStore } from "~/lib/tenant";
import { cn } from "~/lib/utils";
import { getAgentRuns } from "~/server/functions";

export const Route = createFileRoute("/agents/")({
  loader: () => getAgentRuns(),
  component: AgentsPage,
});

/**
 * The chat-capable agents, one tab each. They share the AgentChat surface —
 * only the copy and the backend semantics differ: multiTurn agents continue
 * the same run across messages (the service resumes the Claude session);
 * one-shot agents start a fresh run per message.
 */
const AGENT_TABS = {
  rca: {
    label: "RCA assistant",
    icon: BotIcon,
    tagline: "Read-only · Loki · Tempo · Mimir · Postgres",
    emptyTitle: "Ask the RCA assistant",
    emptyDescription:
      "Ask why something is happening. The assistant runs real Loki, Tempo, Mimir, and " +
      "Postgres queries, shows them inline as it works, and answers from what it finds.",
    placeholder: (tenant: string) => `Message the RCA assistant as ${tenant}…`,
    multiTurn: true,
  },
  "dashboard-generator": {
    label: "Dashboard generator",
    icon: LayoutDashboardIcon,
    tagline: "Mimir · Grafana · reversible, no approval gate",
    emptyTitle: "Describe a dashboard",
    emptyDescription:
      "Give it a brief — e.g. “retriever health: request rate, error rate, p95 latency”. " +
      "It validates the metrics against Mimir, creates the dashboard in Grafana, and " +
      "reports the URL. Each message builds a fresh dashboard.",
    placeholder: () => "Describe the dashboard to create…",
    multiTurn: false,
  },
} as const;

type AgentTab = keyof typeof AGENT_TABS;

const TAB_ORDER: readonly AgentTab[] = ["rca", "dashboard-generator"];

/** What the agent is doing right now, from the newest transcript part. */
function activityLabel(parts: RunFeedPart[]): string {
  const last = parts.at(-1);
  switch (last?.kind) {
    case "tool":
      return last.toolCall.status === "pending"
        ? `Running ${last.toolCall.name}…`
        : "Analyzing results…";
    case "artifact":
      return "Wrapping up…";
    case "message":
      return last.message.role === "user" ? "Starting investigation…" : "Thinking…";
    default:
      return "Investigating…";
  }
}

function AgentsPage() {
  const runsHistory = Route.useLoaderData();
  const [agent, setAgent] = useState<AgentTab>("rca");
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const cfg = AGENT_TABS[agent];

  return (
    <div
      className={cn(
        "mx-auto grid h-full grid-cols-1 gap-4 px-6 py-6",
        openArtifact === null
          ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_300px]"
          : "max-w-none lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]",
      )}
    >
      <div className="flex min-h-0 flex-col">
        <div className="panel-rise mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-xl font-semibold tracking-tight">Agents</h1>
          <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
            {TAB_ORDER.map((kind) => {
              const tab = AGENT_TABS[kind];
              const TabIcon = tab.icon;
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant={agent === kind ? "secondary" : "ghost"}
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => setAgent(kind)}
                >
                  <TabIcon className="size-3.5" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground">{cfg.tagline}</span>
        </div>

        {/* key={agent}: switching tabs remounts the chat, resetting its live
            transcript — each agent keeps its own conversation semantics. */}
        <AgentChat key={agent} agent={agent} onOpenArtifact={setOpenArtifact} />
      </div>

      {openArtifact === null ? (
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
      ) : (
        <div className="min-h-0 max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:bg-background max-lg:p-3">
          <ArtifactPanel
            key={openArtifact.id}
            artifact={openArtifact}
            onClose={() => setOpenArtifact(null)}
            className="h-full"
          />
        </div>
      )}
    </div>
  );
}

/** The shared chat surface: streams any chat-capable agent over the same SSE
 * pipeline. Which agent (and whether messages continue one run or each start
 * a fresh one) comes from AGENT_TABS. */
function AgentChat({
  agent,
  onOpenArtifact,
}: {
  agent: AgentTab;
  onOpenArtifact: (artifact: Artifact | null) => void;
}) {
  const cfg = AGENT_TABS[agent];
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
  const seenArtifactIds = useRef<Set<string>>(new Set());

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
        body: JSON.stringify({
          agent,
          tenant,
          // One-shot agents (dashboard-generator) start a fresh run per
          // message; multi-turn agents continue the same Claude session.
          runId: cfg.multiTurn ? runIdRef.current : undefined,
          message,
        }),
      });
      for await (const event of readAgentStream(res)) {
        switch (event.type) {
          case "run":
            runIdRef.current = event.runId;
            // The run now exists (status: running) — refresh the sidebar so it
            // appears immediately instead of only after the stream ends.
            void router.invalidate();
            break;
          case "token":
            appendToken(event.text);
            break;
          case "tool_call":
            upsertToolCall(event.toolCall);
            break;
          case "artifact": {
            const artifact = event.artifact;
            // Hub replay on a follow-up turn re-delivers old artifact events:
            // upsert by id (like upsertToolCall) instead of appending.
            setParts((p) => {
              const idx = p.findIndex(
                (x) => x.kind === "artifact" && x.artifact.id === artifact.id,
              );
              if (idx === -1) return [...p, { kind: "artifact", artifact }];
              const next = [...p];
              next[idx] = { kind: "artifact", artifact };
              return next;
            });
            // Claude-style auto-open — but only for artifacts this session has
            // not seen, so a replay can't resurrect a panel the user closed.
            if (artifact.mediaType === "text/html" && !seenArtifactIds.current.has(artifact.id)) {
              onOpenArtifact(artifact);
            }
            seenArtifactIds.current.add(artifact.id);
            break;
          }
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

  const blocks = groupRunFeed(parts);
  const lastPart = parts.at(-1);
  const isEmpty = parts.length === 0;
  const EmptyIcon = cfg.icon;
  // The agent thinks for seconds between tool batches and emits nothing while
  // it does — keep the activity marker up for the whole busy window, hiding it
  // only while assistant text is actively streaming (that has its own caret).
  const streamingText = lastPart?.kind === "message" && lastPart.message.role === "assistant";
  const showActivity = busy && !streamingText;

  return (
    <div className="panel-rise panel-rise-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3 px-4 py-5">
              {isEmpty ? (
                <Empty className="my-auto border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <EmptyIcon />
                    </EmptyMedia>
                    <EmptyTitle>{cfg.emptyTitle}</EmptyTitle>
                    <EmptyDescription>{cfg.emptyDescription}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                blocks.map((block, i) => (
                  <MessageScrollerItem
                    key={feedBlockKey(block)}
                    messageId={feedBlockKey(block)}
                    scrollAnchor={block.kind === "message" && block.message.role === "user"}
                  >
                    <RunFeedItem
                      block={block}
                      streaming={
                        busy &&
                        i === blocks.length - 1 &&
                        block.kind === "message" &&
                        block.message.role === "assistant"
                      }
                      onOpenArtifact={onOpenArtifact}
                    />
                  </MessageScrollerItem>
                ))
              )}

              {showActivity ? (
                <MessageScrollerItem messageId="msg-thinking">
                  <div role="status" className="px-0.5">
                    <Shimmer as="p" className="text-sm" duration={1.6}>
                      {activityLabel(parts)}
                    </Shimmer>
                  </div>
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
                          <Link to="/agents/runs/$runId" params={{ runId: runIdRef.current }} />
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
              placeholder={cfg.placeholder(tenant)}
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
  );
}
