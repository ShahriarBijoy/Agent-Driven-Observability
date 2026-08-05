import type { AgentRunSummary, IncidentSummary, RunStatus } from "@obs/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowRightIcon,
  BotIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { RunStatusBadge } from "~/components/run-status-badge";
import { StatusDot, type StatusTone } from "~/components/status-dot";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
import { fmtMs, fmtNumber, fmtPct, timeAgo } from "~/lib/format";
import { INCIDENT_STATUS_STYLES, isIncidentLive, SEV_STYLES } from "~/lib/incident-status";
import { useMountEffect } from "~/lib/use-mount-effect";
import { cn } from "~/lib/utils";
import type { PendingApprovalNotice } from "~/server/db";
import { getOverview } from "~/server/functions";
import type { GoldenSignals } from "~/server/mimir";

export const Route = createFileRoute("/")({
  loader: () => getOverview(),
  pendingComponent: () => (
    <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
      <Spinner />
      <span className="text-sm">Reading signals</span>
    </div>
  ),
  component: OverviewPage,
});

/** Same cadence family as /oncall's 2.5s feed — slower, because the overview is
 * the surface you leave open rather than the one you work in. */
const POLL_MS = 5_000;

/** Runs the operator can still influence; everything else is history. */
const LIVE_RUN_STATUSES = new Set<RunStatus>(["running", "awaiting_approval"]);
const isRunLive = (status: RunStatus) => LIVE_RUN_STATUSES.has(status);

/** Thresholds are the incumbent ones: >5% is the page's "bad", >1% its "warn". */
function signalTone(errorRatePct: number | null): StatusTone {
  if (errorRatePct === null) return "idle";
  if (errorRatePct > 5) return "bad";
  if (errorRatePct > 1) return "warn";
  return "good";
}

/**
 * A measured value is a measured value: full contrast unless a threshold is
 * actually crossed. Only the cells with no threshold to cross ("good") and the
 * ones with no reading at all are anything other than emphatic — otherwise the
 * one toned cell reads as the important one even when nothing is wrong.
 */
const TONE_TEXT: Record<StatusTone, string> = {
  good: "text-foreground",
  warn: "text-warning",
  bad: "text-destructive",
  live: "text-primary",
  idle: "text-foreground",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The one sentence the operator reads first, ordered by how much it demands
 * action: a blocked agent outranks an open incident outranks mere activity.
 * The first two clauses carry weight because they are the ones worth acting on.
 */
function summarize(open: number, approvals: number, live: number) {
  const parts: { text: string; urgent: boolean }[] = [];
  if (approvals > 0)
    parts.push({ text: `${plural(approvals, "approval")} waiting on you`, urgent: true });
  if (open > 0) parts.push({ text: `${plural(open, "incident")} open`, urgent: true });
  if (live > 0) parts.push({ text: `${plural(live, "agent run")} in flight`, urgent: false });
  return parts;
}

function OverviewPage() {
  const { fetchedAt, signals, incidents, runs, approvals, deps } = Route.useLoaderData();
  const router = useRouter();

  useMountEffect(() => {
    const timer = setInterval(() => void router.invalidate(), POLL_MS);
    return () => clearInterval(timer);
  });

  const openIncidents = incidents.filter((i) => isIncidentLive(i.status));
  const liveRuns = runs.filter((r) => isRunLive(r.status));

  // Unsettled work floats up; JS sort is stable, so recency order survives
  // inside each half.
  const orderedIncidents = [...incidents].sort(
    (a, b) => Number(isIncidentLive(b.status)) - Number(isIncidentLive(a.status)),
  );
  const orderedRuns = [...runs].sort(
    (a, b) => Number(isRunLive(b.status)) - Number(isRunLive(a.status)),
  );
  const summary = summarize(openIncidents.length, approvals.length, liveRuns.length);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="panel-rise mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">System overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* "Nothing open" is a claim about the record store, so it can only
                be made when the record store actually answered. */}
            {!deps.records ? (
              <span className="font-medium text-warning">
                Incidents and agent runs unknown — records offline.
              </span>
            ) : summary.length === 0 ? (
              "Nothing open."
            ) : (
              summary.map((part, i) => (
                <span key={part.text}>
                  {i > 0 && <span className="text-muted-foreground/50"> · </span>}
                  <span className={cn(part.urgent && "font-medium text-warning")}>{part.text}</span>
                </span>
              ))
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <DependencyStrip deps={deps} />
          <LiveStamp iso={fetchedAt} />
        </div>
      </header>

      {approvals.length > 0 && <ApprovalBar approvals={approvals} agentServiceUp={deps.agents} />}

      <SignalStrip signals={signals} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm" className="panel-rise panel-rise-3 gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Incidents
              {openIncidents.length > 0 && (
                <Badge variant="secondary" className="bg-warning/15 text-warning">
                  {openIncidents.length} open
                </Badge>
              )}
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="xs"
                nativeButton={false}
                className="text-muted-foreground"
                render={<Link to="/incidents" />}
              >
                View inbox
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-2 pb-1">
            {orderedIncidents.length === 0 ? (
              <LedgerEmpty
                icon={<ActivityIcon />}
                recordsUp={deps.records}
                noun="incidents"
                title="No incidents recorded"
                description="The incident-reporter agent writes its postmortems here."
              />
            ) : (
              <ul className="flex flex-col">
                {orderedIncidents.map((i) => (
                  <IncidentRow key={i.id} incident={i} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="panel-rise panel-rise-4 gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Agent activity
              {liveRuns.length > 0 && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {liveRuns.length} in flight
                </Badge>
              )}
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="xs"
                nativeButton={false}
                className="text-muted-foreground"
                render={<Link to="/agents" />}
              >
                Open agents
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-2 pb-1">
            {orderedRuns.length === 0 ? (
              <LedgerEmpty
                icon={<BotIcon />}
                recordsUp={deps.records}
                noun="agent runs"
                title="No agent runs yet"
                description="Start a conversation on the Agents page to see runs here."
              />
            ) : (
              <ul className="flex flex-col">
                {orderedRuns.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- header ------------------------------------------------------------------

/**
 * Ticks on its own second rather than on the poll. Driven by the loader alone
 * this would sit at "0s ago" forever — including after the poll died, which is
 * exactly when it would be lying. Climbing past the interval turns it amber.
 */
function LiveStamp({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());

  useMountEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  });

  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const stale = seconds > POLL_MS / 1000 + 10;
  return (
    <span
      suppressHydrationWarning
      className={cn("text-[11px]", stale ? "text-warning" : "text-muted-foreground/70")}
    >
      {stale && "stale — "}updated {seconds < 60 ? `${seconds}s ago` : timeAgo(iso)}
    </span>
  );
}

/** The three planes this page reads from, each independently absent much of the
 * time. Quiet when everything answers; named and destructive-toned when not,
 * so a dead lab never reads as a calm one. */
function DependencyStrip({
  deps,
}: {
  deps: { telemetry: boolean; records: boolean; agents: boolean };
}) {
  const items = [
    { label: "Telemetry", up: deps.telemetry },
    { label: "Records", up: deps.records },
    { label: "Agents", up: deps.agents },
  ];
  return (
    <ul className="flex items-center gap-3">
      {items.map((d) => (
        <li
          key={d.label}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            d.up ? "text-muted-foreground" : "font-medium text-destructive",
          )}
        >
          <StatusDot tone={d.up ? "good" : "bad"} />
          {d.label}
          {!d.up && <span className="text-[11px] font-normal">down</span>}
        </li>
      ))}
    </ul>
  );
}

// ---- approval gates ----------------------------------------------------------

/**
 * The page's loudest element, and only ever present when an agent is actually
 * blocked. It links to the run rather than carrying approve/deny itself: a
 * decision is only executable against a server-verified diff, and that diff
 * lives on the run page.
 */
function ApprovalBar({
  approvals,
  agentServiceUp,
}: {
  approvals: PendingApprovalNotice[];
  agentServiceUp: boolean;
}) {
  return (
    <section className="panel-rise panel-rise-1 mb-4 overflow-hidden rounded-xl bg-warning/8 ring-1 ring-warning/30">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <ShieldAlertIcon className="size-4 shrink-0 text-warning" />
        {/* Same words as the approval toast — one gate, one name for it. The
            count already sits in the header sentence, so it isn't repeated. */}
        <h2 className="text-sm font-medium text-warning">
          Approval{approvals.length === 1 ? "" : "s"} required
        </h2>
        {!agentServiceUp && (
          <span className="text-xs text-destructive">
            agent-service is down — decisions can't be submitted
          </span>
        )}
      </div>
      <ul className="flex flex-col px-2 pb-2">
        {approvals.map((a) => (
          <li key={a.approvalId}>
            <Link
              to="/agents/runs/$runId"
              params={{ runId: a.runId }}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-warning/10"
            >
              <span className="w-20 shrink-0 truncate font-mono text-[11px] text-warning">
                {a.agent}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground/90">{a.summary}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.runTitle}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <TimeAgo iso={a.requestedAt} />
              </span>
              {/* Always visible: this is the page's primary action, and a
                  hover-only affordance would hide it from a keyboard or a
                  glance — the two ways it actually gets used. */}
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-warning">
                Review
                <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- golden signals ----------------------------------------------------------

/**
 * An instrument strip, not dashboard tiles: five cells of equal weight so they
 * can be compared at a glance. Colour appears only where a threshold is
 * actually crossed, which is what keeps a healthy lab calm and makes a sick
 * one obvious.
 */
function SignalStrip({ signals }: { signals: GoldenSignals }) {
  if (!signals.reachable) {
    return (
      <section className="panel-rise panel-rise-2 mb-4 flex items-start gap-3 rounded-xl bg-warning/10 p-4 ring-1 ring-warning/25">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="space-y-1">
          <p className="text-sm text-warning">Mimir unreachable — no golden signals.</p>
          <p className="text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">obs up</code> to
            bring the telemetry plane back — until then rate, errors and latency are unknown, not
            zero.
          </p>
        </div>
      </section>
    );
  }

  const errorTone = signalTone(signals.errorRatePct);
  const cells = [
    {
      label: "Requests / s",
      value: fmtNumber(signals.requestRate),
      sub: "gateway, 5m rate",
      known: signals.requestRate !== null,
      tone: "good" as StatusTone,
    },
    {
      label: "Error rate",
      value: fmtPct(signals.errorRatePct),
      sub: "5xx share",
      known: signals.errorRatePct !== null,
      tone: errorTone,
    },
    {
      label: "p50",
      value: fmtMs(signals.p50Ms),
      sub: "span latency",
      known: signals.p50Ms !== null,
      tone: "good" as StatusTone,
    },
    {
      label: "p95",
      value: fmtMs(signals.p95Ms),
      sub: "span latency",
      known: signals.p95Ms !== null,
      tone: "good" as StatusTone,
    },
    {
      label: "p99",
      value: fmtMs(signals.p99Ms),
      sub: "span latency",
      known: signals.p99Ms !== null,
      tone: "good" as StatusTone,
    },
  ];

  return (
    <div className="panel-rise panel-rise-2 mb-4 grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-5 sm:divide-y-0">
      {cells.map((c) => (
        <div
          key={c.label}
          className={cn(
            "px-4 py-3.5 transition-colors",
            c.tone === "bad" && "bg-destructive/6",
            c.tone === "warn" && "bg-warning/6",
          )}
        >
          <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
          <p
            title={c.known ? undefined : "No series in the last 5 minutes"}
            className={cn(
              "mt-1 font-mono text-2xl font-medium tracking-tight tabular-nums",
              // Unknown must not look like a measured zero.
              c.known ? TONE_TEXT[c.tone] : "text-muted-foreground/40",
            )}
          >
            {c.value}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            {c.known ? c.sub : "no series"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---- ledgers -----------------------------------------------------------------

function IncidentRow({ incident }: { incident: IncidentSummary }) {
  const live = isIncidentLive(incident.status);
  return (
    <li>
      <Link
        to="/incidents"
        search={{ id: incident.id }}
        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
      >
        <Badge
          variant="secondary"
          className={cn("uppercase", SEV_STYLES[incident.severity], !live && "opacity-50")}
        >
          {incident.severity}
        </Badge>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            live ? "text-foreground/90" : "text-muted-foreground",
            "group-hover:text-foreground",
          )}
        >
          {incident.title}
        </span>
        <span className={cn("shrink-0 text-xs", INCIDENT_STATUS_STYLES[incident.status])}>
          {incident.status}
        </span>
        <span className="w-14 shrink-0 text-right text-xs text-muted-foreground/70">
          <TimeAgo iso={incident.openedAt} />
        </span>
      </Link>
    </li>
  );
}

function RunRow({ run }: { run: AgentRunSummary }) {
  const live = isRunLive(run.status);
  return (
    <li>
      <Link
        to="/agents/runs/$runId"
        params={{ runId: run.id }}
        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
      >
        {/* Fixed column: agent names vary from "rca" to "incident-reporter",
            and a ragged left edge on the titles makes the list unscannable. */}
        <span
          title={run.agent}
          className={cn(
            "w-20 shrink-0 truncate font-mono text-[11px]",
            live ? "text-info" : "text-info/60",
          )}
        >
          {run.agent}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            live ? "text-foreground/90" : "text-muted-foreground",
            "group-hover:text-foreground",
          )}
        >
          {run.title}
        </span>
        <RunStatusBadge status={run.status} className={cn(!live && "opacity-60")} />
        <span className="w-14 shrink-0 text-right text-xs text-muted-foreground/70">
          <TimeAgo iso={run.createdAt} />
        </span>
      </Link>
    </li>
  );
}

/**
 * An empty list is only news when something was listening. When Postgres is
 * unreachable the honest answer is "we don't know", not "there are none".
 */
function LedgerEmpty({
  icon,
  recordsUp,
  noun,
  title,
  description,
}: {
  icon: ReactNode;
  recordsUp: boolean;
  /** What is unknown, so the two ledgers don't print the same paragraph twice. */
  noun: string;
  title: string;
  description: string;
}) {
  return (
    <Empty className="border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">{recordsUp ? icon : <TriangleAlertIcon />}</EmptyMedia>
        <EmptyTitle>{recordsUp ? title : "Can't reach Postgres"}</EmptyTitle>
        <EmptyDescription>
          {recordsUp ? (
            description
          ) : (
            <>
              Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">obs up</code> to
              bring the record store back — until then {noun} are unknown, not absent.
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
