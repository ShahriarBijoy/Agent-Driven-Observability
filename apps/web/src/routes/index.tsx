import { Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner, StatusDot } from "@obs/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RunStatusBadge } from "~/components/run-status-badge";
import { TimeAgo } from "~/components/time-ago";
import { fmtMs, fmtNumber, fmtPct } from "~/lib/format";
import { getOverview } from "~/server/functions";

export const Route = createFileRoute("/")({
  loader: () => getOverview(),
  pendingComponent: () => (
    <div className="flex h-64 items-center justify-center gap-2 text-ink-faint">
      <Spinner />{" "}
      <span className="font-mono text-xs uppercase tracking-widest">reading signals</span>
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
    { label: "req / s", value: fmtNumber(signals.requestRate), sub: "gateway, 5m rate" },
    { label: "error rate", value: fmtPct(signals.errorRatePct), sub: "5xx share" },
    { label: "p50", value: fmtMs(signals.p50Ms), sub: "span latency" },
    { label: "p95", value: fmtMs(signals.p95Ms), sub: "span latency" },
    { label: "p99", value: fmtMs(signals.p99Ms), sub: "span latency" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="panel-rise mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-medium text-ink">System overview</h1>
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">
          <StatusDot tone={signalTone(signals.errorRatePct)} />
          {signals.requestRate === null ? "telemetry plane unreachable" : "telemetry live"}
        </span>
      </div>

      {/* Golden signals — an instrument strip, not dashboard tiles. */}
      <div className="panel-rise panel-rise-1 mb-6 grid grid-cols-2 divide-x divide-rule-soft rounded-md border border-rule-soft bg-card shadow-card sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
              {s.label}
            </p>
            <p className="mt-1 font-mono text-2xl text-ink tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-ink-faint/70">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="panel-rise panel-rise-2">
          <CardHeader>
            <CardTitle>Recent incidents</CardTitle>
            <Link
              to="/incidents"
              className="font-mono text-[10px] text-signal-dim uppercase hover:text-signal"
            >
              inbox →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <EmptyState
                className="m-3 border-0"
                title="no incidents recorded"
                detail="The incident-reporter agent (Phase 5) writes its postmortems here."
              />
            ) : (
              <ul>
                {incidents.map((i) => (
                  <li key={i.id} className="border-b border-rule-soft px-4 py-2.5 last:border-0">
                    <Link to="/incidents" className="group flex items-baseline gap-3">
                      <span className="font-mono text-[10px] text-warn uppercase">
                        {i.severity}
                      </span>
                      <span className="flex-1 truncate text-sm text-ink-dim group-hover:text-ink">
                        {i.title}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        <TimeAgo iso={i.openedAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="panel-rise panel-rise-3">
          <CardHeader>
            <CardTitle>Agent activity</CardTitle>
            <Link
              to="/agents"
              className="font-mono text-[10px] text-signal-dim uppercase hover:text-signal"
            >
              agents →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <EmptyState
                className="m-3 border-0"
                title="no agent runs yet"
                detail="Start a conversation on the Agents page — the echo agent answers until the real ones land."
              />
            ) : (
              <ul>
                {runs.map((r) => (
                  <li key={r.id} className="border-b border-rule-soft px-4 py-2.5 last:border-0">
                    <Link
                      to="/agents/runs/$runId"
                      params={{ runId: r.id }}
                      className="group flex items-center gap-3"
                    >
                      <span className="font-mono text-[10px] text-data uppercase">{r.agent}</span>
                      <span className="flex-1 truncate text-sm text-ink-dim group-hover:text-ink">
                        {r.title}
                      </span>
                      <RunStatusBadge status={r.status} />
                      <span className="font-mono text-[10px] text-ink-faint">
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
