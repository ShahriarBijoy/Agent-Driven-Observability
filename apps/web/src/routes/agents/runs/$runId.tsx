import type { ToolCall } from "@obs/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useRef } from "react";
import { Markdown } from "~/components/markdown";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Message, MessageContent, MessageHeader } from "~/components/ui/message";
import { Spinner } from "~/components/ui/spinner";
import { useMountEffect } from "~/lib/use-mount-effect";
import { decideApproval, getAgentRun } from "~/server/functions";

export const Route = createFileRoute("/agents/runs/$runId")({
  loader: ({ params }) => getAgentRun({ data: { runId: params.runId } }),
  component: RunDetailPage,
});

const LIVE_STATUSES = new Set(["queued", "running", "awaiting_approval"]);

function RunDetailPage() {
  const run = Route.useLoaderData();
  const router = useRouter();

  // Light polling while the run is in flight — stands in for the Phase-5
  // WebSocket push; the approval flow already works over it. The ref carries
  // the latest status into the interval so polling stops once the run settles.
  const statusRef = useRef(run?.status);
  statusRef.current = run?.status;
  useMountEffect(() => {
    const timer = setInterval(() => {
      if (statusRef.current !== undefined && LIVE_STATUSES.has(statusRef.current)) {
        void router.invalidate();
      }
    }, 2_500);
    return () => clearInterval(timer);
  });

  if (run === null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Run not found</EmptyTitle>
            <EmptyDescription>
              Echo runs live in BFF memory and evaporate on dev-server restart. Real runs persist
              now that agent-service is up.
            </EmptyDescription>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              className="mt-2"
              render={<Link to="/agents" />}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back to agents
            </Button>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const pendingApproval = run.approvals.find((a) => a.decision === undefined);

  async function decide(decision: "approved" | "denied") {
    if (pendingApproval === undefined) return;
    await decideApproval({
      data: { runId: run!.id, approvalId: pendingApproval.id, decision },
    });
    await router.invalidate();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="panel-rise mb-5">
        <Button
          variant="ghost"
          size="xs"
          nativeButton={false}
          className="-ml-2 text-muted-foreground"
          render={<Link to="/agents" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Agents
        </Button>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-lg font-semibold tracking-tight">{run.title}</h1>
          <Badge variant="secondary">{run.agent}</Badge>
          <RunStatusBadge status={run.status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{run.id}</span> · tenant {run.tenant} · started{" "}
          <TimeAgo iso={run.createdAt} />
        </p>
      </div>

      {pendingApproval !== undefined ? (
        <div className="panel-rise mb-5 rounded-xl border border-warning/30 bg-warning/10 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <ShieldAlertIcon className="size-4" />
            Approval gate — agent paused
          </p>
          <p className="mt-2 text-sm text-foreground/90">{pendingApproval.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requested <TimeAgo iso={pendingApproval.requestedAt} />
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void decide("approved")}>
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void decide("denied")}>
              <XIcon data-icon="inline-start" />
              Deny
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="panel-rise panel-rise-1">
            <CardHeader>
              <CardTitle>Message log</CardTitle>
            </CardHeader>
            <CardContent>
              {run.messages.length === 0 ? (
                <p className="text-xs text-muted-foreground">No messages recorded.</p>
              ) : (
                <div className="flex flex-col gap-5">
                  {run.messages.map((m) => (
                    <Message key={m.id} align={m.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <MessageHeader className="gap-2">
                          <span className="font-medium">
                            {m.role === "user" ? "Operator" : m.role}
                          </span>
                          <span className="text-muted-foreground/70">
                            <TimeAgo iso={m.createdAt} />
                          </span>
                        </MessageHeader>
                        {m.role === "user" ? (
                          <Bubble align="end" variant="secondary">
                            <BubbleContent className="whitespace-pre-wrap">
                              {m.content}
                            </BubbleContent>
                          </Bubble>
                        ) : (
                          <Bubble variant="ghost">
                            <BubbleContent>
                              <Markdown className="typeset-chat">{m.content}</Markdown>
                            </BubbleContent>
                          </Bubble>
                        )}
                      </MessageContent>
                    </Message>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {run.artifacts.length > 0 ? (
            <Card className="panel-rise panel-rise-2">
              <CardHeader>
                <CardTitle>Artifacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {run.artifacts.map((a) => (
                  <div key={a.id}>
                    <p className="mb-2 flex items-center gap-2 text-xs font-medium">
                      <FileTextIcon className="size-3.5 text-muted-foreground" />
                      <span className="font-mono">{a.name}</span>
                      <Badge variant="outline" className="text-muted-foreground">
                        {a.mediaType}
                      </Badge>
                    </p>
                    {a.mediaType === "text/markdown" ? (
                      <div className="rounded-xl border px-5 py-4">
                        <Markdown className="typeset-docs">{a.content}</Markdown>
                      </div>
                    ) : (
                      <pre className="overflow-x-auto rounded-xl border bg-muted/50 px-4 py-3 font-mono text-xs">
                        {a.content}
                      </pre>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card size="sm" className="panel-rise panel-rise-2">
            <CardHeader>
              <CardTitle>Tool calls</CardTitle>
            </CardHeader>
            <CardContent>
              {run.toolCalls.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tool calls.</p>
              ) : (
                <div className="flex flex-col">
                  {run.toolCalls.map((tc) => (
                    <ToolCallRow key={tc.id} toolCall={tc} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {run.approvals.length > 0 ? (
            <Card size="sm" className="panel-rise panel-rise-3">
              <CardHeader>
                <CardTitle>Approvals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {run.approvals.map((a) => (
                  <div key={a.id} className="rounded-lg border px-3 py-2">
                    <p className="text-xs">{a.summary}</p>
                    <p className="mt-1 text-xs">
                      {a.decision === undefined ? (
                        <span className="font-medium text-warning">Pending</span>
                      ) : (
                        <span
                          className={
                            a.decision === "approved"
                              ? "font-medium text-success"
                              : "font-medium text-destructive"
                          }
                        >
                          {a.decision}{" "}
                          {a.decidedAt !== undefined ? <TimeAgo iso={a.decidedAt} /> : ""}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToolCallRow({ toolCall: tc }: { toolCall: ToolCall }) {
  const duration =
    tc.endedAt !== undefined
      ? `${Math.max(0, new Date(tc.endedAt).getTime() - new Date(tc.startedAt).getTime())}ms`
      : "running";

  return (
    <Collapsible className="group/tool border-b border-border/60 py-1.5 last:border-0">
      <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md py-1 text-left transition-colors hover:text-foreground">
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-has-[[data-panel-open]]/tool:rotate-90" />
        {tc.status === "ok" ? (
          <CheckIcon className="size-3.5 shrink-0 text-success" />
        ) : tc.status === "error" ? (
          <XIcon className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <Spinner className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{tc.name}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{duration}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 mb-1.5 space-y-1.5 pl-6">
          <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {JSON.stringify(tc.args, null, 2)}
          </pre>
          {tc.result !== undefined ? (
            <p className="text-xs text-muted-foreground">{tc.result}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground/70">
            Started <TimeAgo iso={tc.startedAt} />
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
