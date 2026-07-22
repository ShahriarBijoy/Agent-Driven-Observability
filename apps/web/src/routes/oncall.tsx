import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CheckIcon, ExternalLinkIcon, RadioTowerIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Markdown } from "~/components/markdown";
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
import { useMountEffect } from "~/lib/use-mount-effect";
import { cn } from "~/lib/utils";
import type { OncallIncident, OncallIncidentDetail } from "~/server/db";
import { decideApproval, getOncallFeed, getOncallIncident } from "~/server/functions";

export const Route = createFileRoute("/oncall")({
  validateSearch: z.object({ id: z.string().optional() }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    const [incidents, selected] = await Promise.all([
      getOncallFeed(),
      deps.id !== undefined ? getOncallIncident({ data: { id: deps.id } }) : Promise.resolve(null),
    ]);
    return { incidents, selected };
  },
  component: OncallPage,
});

const SEV_STYLES = {
  sev1: "bg-destructive/10 text-destructive",
  sev2: "bg-warning/15 text-warning",
  sev3: "bg-muted text-muted-foreground",
} as const;

/** open+no pending approval = investigating; open+pending = awaiting approval;
 * resolved+verified_at = verified; resolved without = plain resolved. Pending
 * approval is derived from the linked runs (any `awaiting_approval` status)
 * rather than a separate field — the feed already carries run statuses. */
function statusBadge(incident: OncallIncident): { label: string; className: string } {
  const awaitingApproval = incident.runs.some((r) => r.status === "awaiting_approval");
  if (incident.status === "resolved") {
    return incident.verifiedAt !== undefined
      ? { label: "verified", className: "bg-success/15 text-success" }
      : { label: "resolved", className: "bg-muted text-muted-foreground" };
  }
  return awaitingApproval
    ? {
        label: "awaiting approval",
        className: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
      }
    : { label: "investigating", className: "bg-warning/15 text-warning" };
}

function deadlineLabel(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  const overdue = ms <= 0;
  const abs = Math.abs(ms) / 1000;
  const unit =
    abs < 60
      ? `${Math.floor(abs)}s`
      : abs < 3600
        ? `${Math.floor(abs / 60)}m`
        : `${Math.floor(abs / 3600)}h`;
  return { text: overdue ? `verify overdue by ${unit}` : `verify in ${unit}`, overdue };
}

/** Diff blocks arrive appended to the approval summary as plain text after the
 * server-verified marker (remediate.py never fences them) — wrap that tail in
 * a fenced code block so <Markdown> renders it monospace with whitespace
 * preserved, instead of collapsing it into a run-on paragraph. */
function formatApprovalSummary(summary: string): string {
  const markerIdx = summary.indexOf("--- server-verified dry-run");
  if (markerIdx === -1) return summary;
  const before = summary.slice(0, markerIdx).trimEnd();
  const block = summary.slice(markerIdx).trim();
  if (block.startsWith("```")) return summary;
  return `${before}\n\n\`\`\`\n${block}\n\`\`\``;
}

function OncallPage() {
  const { incidents, selected } = Route.useLoaderData();
  const { id } = Route.useSearch();
  const router = useRouter();

  // Live feed — same 2.5s poll as the run detail page (agents/runs/$runId.tsx);
  // an alert-storm or an escalation can land at any moment.
  useMountEffect(() => {
    const timer = setInterval(() => void router.invalidate(), 2_500);
    return () => clearInterval(timer);
  });

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col">
        <h1 className="panel-rise mb-4 font-heading text-xl font-semibold tracking-tight">
          On-call
        </h1>
        <Card className="panel-rise panel-rise-1 min-h-0 gap-0 overflow-y-auto py-2">
          <CardContent className="px-2">
            {incidents.length === 0 ? (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <RadioTowerIcon />
                  </EmptyMedia>
                  <EmptyTitle>All quiet</EmptyTitle>
                  <EmptyDescription>
                    The on-call agent files a page here the moment a firing alert lands on the
                    webhook.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {incidents.map((i) => {
                  const badge = statusBadge(i);
                  return (
                    <li key={i.id}>
                      <Link
                        to="/oncall"
                        search={{ id: i.id }}
                        className={cn(
                          "block rounded-lg px-3 py-2.5 transition-colors hover:bg-muted",
                          id === i.id && "bg-muted ring-1 ring-primary/40",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className={SEV_STYLES[i.severity]}>
                            {i.severity}
                          </Badge>
                          <Badge variant="secondary" className={badge.className}>
                            {badge.label}
                          </Badge>
                          {i.escalations > 0 ? (
                            <Badge variant="outline" className="text-muted-foreground">
                              attempt {i.escalations + 1}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm font-medium text-foreground/90">{i.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {i.alertCount} alert{i.alertCount === 1 ? "" : "s"} · opened{" "}
                          <TimeAgo iso={i.openedAt} />
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 overflow-y-auto">
        {selected === null ? (
          <Empty className="mt-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RadioTowerIcon />
              </EmptyMedia>
              <EmptyTitle>Select a page</EmptyTitle>
              <EmptyDescription>
                Pre-check leads, the matched runbook, the machine timeline, and any pending approval
                render here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <IncidentDetailPanel key={selected.id} incident={selected} />
        )}
      </div>
    </div>
  );
}

/** The selected incident's full on-call detail. Keyed by incident id upstream
 * so the approval decide-in-flight state resets on selection change. */
function IncidentDetailPanel({ incident }: { incident: OncallIncidentDetail }) {
  const router = useRouter();
  const [deciding, setDeciding] = useState(false);
  const badge = statusBadge(incident);
  const deadline =
    incident.verifyDeadline !== undefined && incident.status === "open"
      ? deadlineLabel(incident.verifyDeadline)
      : null;

  async function decide(decision: "approved" | "denied") {
    if (incident.pendingApproval === null) return;
    setDeciding(true);
    try {
      await decideApproval({
        data: {
          runId: incident.pendingApproval.runId,
          approvalId: incident.pendingApproval.approvalId,
          decision,
        },
      });
      await router.invalidate();
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Card className="panel-rise panel-rise-2">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{incident.title}</CardTitle>
            <Badge variant="secondary" className={SEV_STYLES[incident.severity]}>
              {incident.severity}
            </Badge>
            <Badge variant="secondary" className={badge.className}>
              {badge.label}
            </Badge>
            {incident.escalations > 0 ? (
              <Badge variant="outline" className="text-muted-foreground">
                attempt {incident.escalations + 1}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{incident.id}</span> · opened{" "}
            <TimeAgo iso={incident.openedAt} />
            {deadline !== null ? (
              <>
                {" "}
                ·{" "}
                <span className={deadline.overdue ? "text-destructive" : undefined}>
                  {deadline.text}
                </span>
              </>
            ) : null}
          </p>
        </CardHeader>
      </Card>

      {incident.prechecksMd !== null ? (
        <Card className="panel-rise panel-rise-2">
          <CardHeader className="border-b">
            <CardTitle>Pre-check leads</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Markdown className="typeset-docs">{incident.prechecksMd}</Markdown>
          </CardContent>
        </Card>
      ) : null}

      {incident.runbookMatchMd !== null ? (
        <Card className="panel-rise panel-rise-2">
          <CardHeader className="border-b">
            <CardTitle>Runbook match</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Markdown className="typeset-docs">{incident.runbookMatchMd}</Markdown>
          </CardContent>
        </Card>
      ) : null}

      {incident.pendingApproval !== null ? (
        <Card className="panel-rise panel-rise-2 border-warning/30 bg-warning/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <ShieldAlertIcon className="size-4" />
              Approval gate — agent paused
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown className="typeset-docs">
              {formatApprovalSummary(incident.pendingApproval.summary)}
            </Markdown>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={deciding} onClick={() => void decide("approved")}>
                <CheckIcon data-icon="inline-start" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deciding}
                onClick={() => void decide("denied")}
              >
                <XIcon data-icon="inline-start" />
                Deny
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {incident.runs.length > 0 ? (
        <Card className="panel-rise panel-rise-2">
          <CardHeader className="border-b">
            <CardTitle>Linked runs</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="flex flex-col gap-1.5">
              {incident.runs.map((r) => (
                <li key={r.runId}>
                  <Link
                    to="/agents/runs/$runId"
                    params={{ runId: r.runId }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <Badge variant="outline">{r.kind}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{r.runId}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {r.status.replace("_", " ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {incident.timeline.length > 0 ? (
        <Card className="panel-rise panel-rise-2">
          <CardHeader className="border-b">
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
              {incident.timeline.map((t, idx) => (
                <li key={`${t.ts}-${idx}`}>
                  {t.ts.slice(0, 19).replace("T", " ")} — [{t.source}] {t.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {incident.postmortemPrUrl !== undefined ? (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="self-start"
          render={<a href={incident.postmortemPrUrl} target="_blank" rel="noreferrer" />}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          Postmortem PR
        </Button>
      ) : null}
    </div>
  );
}
