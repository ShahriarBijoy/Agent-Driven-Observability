import { createFileRoute, Link } from "@tanstack/react-router";
import { ActivityIcon, BotIcon } from "lucide-react";
import { RunStatusBadge } from "~/components/run-status-badge";
import { StatusDot } from "~/components/status-dot";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
import { fmtMs, fmtNumber, fmtPct } from "~/lib/format";
import { getOverview } from "~/server/functions";

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

function signalTone(errorRatePct: number | null): "good" | "warn" | "bad" | "idle" {
  if (errorRatePct === null) return "idle";
  if (errorRatePct > 5) return "bad";
  if (errorRatePct > 1) return "warn";
  return "good";
}

function OverviewPage() {
  const { signals, incidents, runs } = Route.useLoaderData();

  const stats = [
    { label: "Requests / s", value: fmtNumber(signals.requestRate), sub: "gateway, 5m rate" },
    { label: "Error rate", value: fmtPct(signals.errorRatePct), sub: "5xx share" },
    { label: "p50", value: fmtMs(signals.p50Ms), sub: "span latency" },
    { label: "p95", value: fmtMs(signals.p95Ms), sub: "span latency" },
    { label: "p99", value: fmtMs(signals.p99Ms), sub: "span latency" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="panel-rise mb-6 flex items-baseline justify-between">
        <h1 className="font-heading text-xl font-semibold tracking-tight">System overview</h1>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot tone={signalTone(signals.errorRatePct)} />
          {signals.requestRate === null ? "Telemetry plane unreachable" : "Telemetry live"}
        </span>
      </div>

      {/* Golden signals — an instrument strip, not dashboard tiles. */}
      <div className="panel-rise panel-rise-1 mb-6 grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-3.5">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-2xl font-medium tracking-tight tabular-nums">
              {s.value}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm" className="panel-rise panel-rise-2 gap-2">
          <CardHeader>
            <CardTitle>Recent incidents</CardTitle>
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
            {incidents.length === 0 ? (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ActivityIcon />
                  </EmptyMedia>
                  <EmptyTitle>No incidents recorded</EmptyTitle>
                  <EmptyDescription>
                    The incident-reporter agent writes its postmortems here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <Link
                      to="/incidents"
                      search={{ id: i.id }}
                      className="group flex items-baseline gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <Badge
                        variant="secondary"
                        className="bg-destructive/10 text-destructive uppercase"
                      >
                        {i.severity}
                      </Badge>
                      <span className="flex-1 truncate text-sm text-foreground/80 group-hover:text-foreground">
                        {i.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <TimeAgo iso={i.openedAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="panel-rise panel-rise-3 gap-2">
          <CardHeader>
            <CardTitle>Agent activity</CardTitle>
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
            {runs.length === 0 ? (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BotIcon />
                  </EmptyMedia>
                  <EmptyTitle>No agent runs yet</EmptyTitle>
                  <EmptyDescription>
                    Start a conversation on the Agents page to see runs here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/agents/runs/$runId"
                      params={{ runId: r.id }}
                      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <span className="shrink-0 font-mono text-[11px] text-info">{r.agent}</span>
                      <span className="flex-1 truncate text-sm text-foreground/80 group-hover:text-foreground">
                        {r.title}
                      </span>
                      <RunStatusBadge status={r.status} />
                      <span className="shrink-0 text-xs text-muted-foreground">
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
