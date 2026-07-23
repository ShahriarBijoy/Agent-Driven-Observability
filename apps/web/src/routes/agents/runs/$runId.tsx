import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  FileTextIcon,
  MessageCircleIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { Artifact } from "@obs/contracts";
import { ArtifactPanel } from "~/components/artifact-panel";
import { RunStatusBadge } from "~/components/run-status-badge";
import { RunFeedItem } from "~/components/run-feed-item";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Frame, FramePanel } from "~/components/ui/frame";
import { ScrollArea } from "~/components/ui/scroll-area";
import { buildRunFeed, feedBlockKey, groupRunFeed } from "~/lib/run-feed";
import { useMountEffect } from "~/lib/use-mount-effect";
import { cn } from "~/lib/utils";
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
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
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
  const feed = groupRunFeed(buildRunFeed(run));

  async function decide(decision: "approved" | "denied") {
    if (pendingApproval === undefined) return;
    await decideApproval({
      data: { runId: run!.id, approvalId: pendingApproval.id, decision },
    });
    await router.invalidate();
  }

  return (
    <div
      className={cn(
        "mx-auto grid h-full grid-cols-1 px-6 py-6",
        openArtifact !== null
          ? "max-w-none gap-5 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]"
          : "w-full max-w-3xl",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-col">
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
            {run.agent === "rca" ? (
              // RCA runs are conversations — reopen this one in the chat
              // surface to ask follow-ups in the same Claude session.
              <Button
                variant="outline"
                size="xs"
                nativeButton={false}
                render={<Link to="/agents" search={{ run: run.id }} />}
              >
                <MessageCircleIcon data-icon="inline-start" />
                Continue in chat
              </Button>
            ) : null}
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

        {/* The transcript lives in a fixed-height frame and scrolls internally,
            like the live chat window — the page itself never grows. */}
        <Frame className="panel-rise panel-rise-1 min-h-0 flex-1">
          <FramePanel className="flex min-h-0 grow flex-col overflow-hidden p-0">
            <ScrollArea
              className="min-h-0 flex-1"
              viewportClassName="scroll-fade-b overscroll-contain px-4 py-5"
            >
              <div className="flex flex-col gap-4">
                {feed.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No messages recorded.</p>
                ) : (
                  feed.map((block) => (
                    <RunFeedItem
                      key={feedBlockKey(block)}
                      block={block}
                      onOpenArtifact={setOpenArtifact}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </FramePanel>
        </Frame>
      </div>

      {openArtifact !== null ? (
        <div className="min-h-0 max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:bg-background max-lg:p-3">
          <ArtifactPanel
            key={openArtifact.id}
            artifact={openArtifact}
            onClose={() => setOpenArtifact(null)}
            className="h-full"
          />
        </div>
      ) : null}
    </div>
  );
}
