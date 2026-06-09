import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, cn } from "@obs/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Markdown } from "~/components/markdown";
import { TimeAgo } from "~/components/time-ago";
import { getIncidentInbox } from "~/server/functions";

export const Route = createFileRoute("/incidents")({
  validateSearch: z.object({ id: z.string().optional() }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: ({ deps }) => getIncidentInbox({ data: { id: deps.id } }),
  component: IncidentsPage,
});

const SEV_TONE = { sev1: "warn", sev2: "signal", sev3: "neutral" } as const;

function IncidentsPage() {
  const { incidents, selected } = Route.useLoaderData();
  const { id } = Route.useSearch();

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[340px_1fr]">
      <div className="min-h-0">
        <h1 className="panel-rise mb-4 font-display text-2xl font-medium text-ink">Incidents</h1>
        <Card className="panel-rise panel-rise-1 max-h-full overflow-y-auto">
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <EmptyState
                className="m-3 border-0"
                title="inbox zero"
                detail="The incident-reporter agent files postmortems here once Phase 5 lands."
              />
            ) : (
              <ul>
                {incidents.map((i) => (
                  <li key={i.id} className="border-b border-rule-soft last:border-0">
                    <Link
                      to="/incidents"
                      search={{ id: i.id }}
                      className={cn(
                        "block px-4 py-3 transition-colors hover:bg-elev/60",
                        id === i.id && "border-l-2 border-l-signal bg-signal/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
                        <Badge tone={i.status === "resolved" ? "good" : "warn"}>{i.status}</Badge>
                        {i.id.startsWith("sample-") ? <Badge tone="data">sample</Badge> : null}
                      </div>
                      <p className="mt-1.5 text-sm text-ink-dim">{i.title}</p>
                      <p className="mt-1 font-mono text-[10px] text-ink-faint">
                        {i.tenant} · opened <TimeAgo iso={i.openedAt} />
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 overflow-y-auto">
        {selected === null ? (
          <EmptyState
            className="mt-14"
            title="select an incident"
            detail="The reporter agent's postmortem renders here, with links back to the source traces and logs."
          />
        ) : (
          <Card className="panel-rise panel-rise-2">
            <CardHeader>
              <CardTitle>Postmortem</CardTitle>
              <span className="font-mono text-[10px] text-ink-faint uppercase">{selected.id}</span>
            </CardHeader>
            <CardContent>
              <p className="mb-4 border-b border-rule-soft pb-4 text-sm text-ink-dim italic">
                {selected.summary}
              </p>
              {selected.postmortemMd !== undefined ? (
                <Markdown>{selected.postmortemMd}</Markdown>
              ) : (
                <p className="text-xs text-ink-faint">No postmortem attached.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
