import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  FileTextIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useRef } from "react";
import { RunStatusBadge } from "~/components/run-status-badge";
import { ArtifactCard, RunFeedItem } from "~/components/run-feed-item";
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
import { buildRunFeed, feedPartKey } from "~/lib/run-feed";
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
  const feed = buildRunFeed(run);

  async function decide(decision: "approved" | "denied") {
    if (pendingApproval === undefined) return;
    await decideApproval({
      data: { runId: run!.id, approvalId: pendingApproval.id, decision },
    });
    await router.invalidate();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
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

      <div className="panel-rise panel-rise-1 flex flex-col gap-4">
        {feed.length === 0 ? (
          <p className="text-xs text-muted-foreground">No messages recorded.</p>
        ) : (
          feed.map((part) => <RunFeedItem key={feedPartKey(part)} part={part} />)
        )}

        {run.artifacts.map((artifact) => (
          <ArtifactCard key={artifact.id} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}
