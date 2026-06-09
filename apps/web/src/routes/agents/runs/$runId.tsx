import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusDot,
} from "@obs/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef } from "react";
import { Markdown } from "~/components/markdown";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
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
        <EmptyState
          title="run not found"
          detail="Echo runs live in BFF memory and evaporate on dev-server restart. Real runs persist once agent-service lands in Phase 5."
          action={
            <Link
              to="/agents"
              className="font-mono text-[11px] text-signal-dim uppercase hover:text-signal"
            >
              back to agents →
            </Link>
          }
        />
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
        <Link
          to="/agents"
          className="font-mono text-[10px] text-ink-faint uppercase hover:text-signal"
        >
          ← agents
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-medium text-ink">{run.title}</h1>
          <Badge tone="data">{run.agent}</Badge>
          <RunStatusBadge status={run.status} />
          <span className="font-mono text-[10px] text-ink-faint">
            {run.id} · tenant {run.tenant} · started <TimeAgo iso={run.createdAt} />
          </span>
        </div>
      </div>

      {pendingApproval !== undefined ? (
        <div className="panel-rise mb-5 rounded-md border border-signal-dim/50 bg-signal/5 px-5 py-4">
          <p className="font-mono text-[11px] tracking-[0.14em] text-signal uppercase">
            approval gate — agent paused
          </p>
          <p className="mt-2 text-sm text-ink-dim">{pendingApproval.summary}</p>
          <p className="mt-1 font-mono text-[10px] text-ink-faint">
            requested <TimeAgo iso={pendingApproval.requestedAt} />
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="signal" onClick={() => void decide("approved")}>
              approve
            </Button>
            <Button variant="danger" onClick={() => void decide("denied")}>
              deny
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="panel-rise panel-rise-1">
            <CardHeader>
              <CardTitle>Message log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 py-3">
              {run.messages.length === 0 ? (
                <p className="text-xs text-ink-faint">No messages recorded.</p>
              ) : (
                run.messages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-sm border border-rule-soft bg-inset px-3 py-2.5"
                  >
                    <p className="mb-1 flex items-baseline justify-between font-mono text-[9px] tracking-[0.16em] text-ink-faint uppercase">
                      {m.role === "user" ? "operator" : m.role}
                      <TimeAgo iso={m.createdAt} />
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-ink-dim">{m.content}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {run.artifacts.length > 0 ? (
            <Card className="panel-rise panel-rise-2">
              <CardHeader>
                <CardTitle>Artifacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 py-3">
                {run.artifacts.map((a) => (
                  <div key={a.id}>
                    <p className="mb-1.5 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
                      <span className="text-data">▣</span>
                      {a.name}
                      <Badge tone="neutral">{a.mediaType}</Badge>
                    </p>
                    {a.mediaType === "text/markdown" ? (
                      <div className="rounded-sm border border-rule-soft px-4 py-3">
                        <Markdown>{a.content}</Markdown>
                      </div>
                    ) : (
                      <pre className="overflow-x-auto rounded-sm border border-rule-soft bg-inset px-4 py-3 font-mono text-xs text-ink-dim">
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
          <Card className="panel-rise panel-rise-2">
            <CardHeader>
              <CardTitle>Tool-call timeline</CardTitle>
            </CardHeader>
            <CardContent className="py-3">
              {run.toolCalls.length === 0 ? (
                <p className="text-xs text-ink-faint">No tool calls.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-rule pl-4">
                  {run.toolCalls.map((tc) => (
                    <li key={tc.id} className="relative">
                      <span className="absolute top-1 -left-[21px]">
                        <StatusDot
                          tone={
                            tc.status === "ok" ? "good" : tc.status === "error" ? "bad" : "live"
                          }
                        />
                      </span>
                      <p className="font-mono text-[11px] text-data">{tc.name}</p>
                      <pre className="mt-1 overflow-x-auto rounded-xs bg-inset px-2 py-1 font-mono text-[10px] text-ink-faint">
                        {JSON.stringify(tc.args, null, 2)}
                      </pre>
                      {tc.result !== undefined ? (
                        <p className="mt-1 text-[11px] text-ink-faint">{tc.result}</p>
                      ) : null}
                      <p className="mt-0.5 font-mono text-[9px] text-ink-faint/70 uppercase">
                        <TimeAgo iso={tc.startedAt} />
                        {tc.endedAt !== undefined
                          ? ` · ${Math.max(0, new Date(tc.endedAt).getTime() - new Date(tc.startedAt).getTime())}ms`
                          : " · running"}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {run.approvals.length > 0 ? (
            <Card className="panel-rise panel-rise-3">
              <CardHeader>
                <CardTitle>Approvals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 py-3">
                {run.approvals.map((a) => (
                  <div key={a.id} className="rounded-sm border border-rule-soft bg-inset px-3 py-2">
                    <p className="text-xs text-ink-dim">{a.summary}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase">
                      {a.decision === undefined ? (
                        <span className="text-signal">pending</span>
                      ) : (
                        <span className={a.decision === "approved" ? "text-good" : "text-warn"}>
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
