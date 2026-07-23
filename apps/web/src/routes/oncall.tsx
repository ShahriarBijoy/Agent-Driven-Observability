import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CheckIcon, ExternalLinkIcon, RadioTowerIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { z } from "zod";
import { Markdown } from "~/components/markdown";
import { RunStatusBadge } from "~/components/run-status-badge";
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
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "~/components/ui/frame";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Spinner } from "~/components/ui/spinner";
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

/** Shared row treatment for the selectable lists on the master–detail pages:
 * hover, keyboard focus, and the selected state all read the same way. */
const LIST_ROW =
  "block rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-muted " +
  "focus-visible:ring-2 focus-visible:ring-ring/60";
const LIST_ROW_SELECTED = "bg-muted ring-1 ring-primary/40";

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
 * preserved, instead of collapsing it into a run-on paragraph. Don't double-wrap
 * if the block already contains embedded fences. */
function formatApprovalSummary(summary: string): string {
  const markerIdx = summary.indexOf("--- server-verified dry-run");
  if (markerIdx === -1) return summary;
  const before = summary.slice(0, markerIdx).trimEnd();
  const block = summary.slice(markerIdx).trim();
  if (block.includes("```")) return summary;
  return `${before}\n\n\`\`\`\n${block}\n\`\`\``;
}

/** The agent's artifacts open with their own "# Title" heading; the frame
 * section header already names the panel, so drop that first heading line
 * instead of titling every section twice. */
function stripSelfTitle(md: string): string {
  return md.replace(/^\s*#{1,6}[^\n]*\n+/, "");
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
      <Frame spacing="sm" className="panel-rise min-h-0">
        <FrameHeader className="justify-between">
          <h1 className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
            On-call
            {/* The pulse marks the 2.5s auto-refresh — the operator never
                needs to reload this page during an incident. */}
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-success/80" />
            </span>
            <span className="sr-only">(auto-refreshing)</span>
          </h1>
          <span className="text-[11px] tabular-nums text-muted-foreground">{incidents.length}</span>
        </FrameHeader>
        <FramePanel className="flex min-h-0 flex-col p-0">
          <ScrollArea className="min-h-0 flex-1" viewportClassName="overscroll-contain p-1.5">
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
                        aria-current={id === i.id ? "true" : undefined}
                        className={cn(LIST_ROW, id === i.id && LIST_ROW_SELECTED)}
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
          </ScrollArea>
        </FramePanel>
      </Frame>

      <ScrollArea className="min-h-0" viewportClassName="overscroll-contain">
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
      </ScrollArea>
    </div>
  );
}

/** Small muted label sitting in the frame area between panels. */
function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <FrameHeader className="pt-2.5 pb-1">
      <FrameTitle className="text-xs font-medium tracking-wide text-muted-foreground">
        {children}
      </FrameTitle>
    </FrameHeader>
  );
}

/** The selected incident's full on-call detail: one frame, one section per
 * panel — instead of a loose stack of cards. Keyed by incident id upstream
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
    <Frame className="panel-rise panel-rise-2 mb-6">
      <FrameHeader className="flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <FrameTitle className="leading-snug">{incident.title}</FrameTitle>
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
        <FrameDescription className="text-xs">
          <span className="font-mono">{incident.id}</span> · opened{" "}
          <TimeAgo iso={incident.openedAt} />
          {deadline !== null ? (
            <>
              {" "}
              ·{" "}
              <span className={deadline.overdue ? "font-medium text-destructive" : undefined}>
                {deadline.text}
              </span>
            </>
          ) : null}
        </FrameDescription>
      </FrameHeader>

      {incident.pendingApproval !== null ? (
        <FramePanel fit className="border-warning/40 bg-warning/10">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <ShieldAlertIcon className="size-4" aria-hidden />
            Approval gate — agent paused
          </p>
          <Markdown className="typeset-docs mt-2">
            {formatApprovalSummary(incident.pendingApproval.summary)}
          </Markdown>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={deciding} onClick={() => void decide("approved")}>
              {deciding ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CheckIcon data-icon="inline-start" />
              )}
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
        </FramePanel>
      ) : null}

      {incident.prechecksMd !== null ? (
        <>
          <SectionHeader>Pre-check leads</SectionHeader>
          <FramePanel fit>
            <Markdown className="typeset-docs">{stripSelfTitle(incident.prechecksMd)}</Markdown>
          </FramePanel>
        </>
      ) : null}

      {incident.runbookMatchMd !== null ? (
        <>
          <SectionHeader>Runbook match</SectionHeader>
          <FramePanel fit>
            <Markdown className="typeset-docs">{stripSelfTitle(incident.runbookMatchMd)}</Markdown>
          </FramePanel>
        </>
      ) : null}

      {incident.runs.length > 0 ? (
        <>
          <SectionHeader>Linked runs</SectionHeader>
          <FramePanel fit className="p-1.5">
            <ul className="flex flex-col gap-0.5">
              {incident.runs.map((r) => (
                <li key={r.runId}>
                  <Link
                    to="/agents/runs/$runId"
                    params={{ runId: r.runId }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <Badge variant="outline">{r.kind}</Badge>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {r.runId}
                    </span>
                    <RunStatusBadge status={r.status} className="ml-auto" />
                  </Link>
                </li>
              ))}
            </ul>
          </FramePanel>
        </>
      ) : null}

      {incident.timeline.length > 0 ? (
        <>
          <SectionHeader>Timeline</SectionHeader>
          <FramePanel fit>
            <ul className="flex flex-col gap-1.5">
              {incident.timeline.map((t, idx) => (
                <li key={`${t.ts}-${idx}`} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono tabular-nums whitespace-nowrap text-muted-foreground/70">
                    {t.ts.slice(0, 19).replace("T", " ")}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                    {t.source}
                  </Badge>
                  <span className="min-w-0 text-muted-foreground">{t.label}</span>
                </li>
              ))}
            </ul>
          </FramePanel>
        </>
      ) : null}

      {incident.postmortemPrUrl !== undefined ? (
        <FrameFooter>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={incident.postmortemPrUrl} target="_blank" rel="noreferrer" />}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Postmortem PR
          </Button>
        </FrameFooter>
      ) : null}
    </Frame>
  );
}
