import { createFileRoute, Link } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { z } from "zod";
import { Markdown } from "~/components/markdown";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { cn } from "~/lib/utils";
import { getIncidentInbox } from "~/server/functions";

export const Route = createFileRoute("/incidents")({
  validateSearch: z.object({ id: z.string().optional() }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: ({ deps }) => getIncidentInbox({ data: { id: deps.id } }),
  component: IncidentsPage,
});

const SEV_STYLES = {
  sev1: "bg-destructive/10 text-destructive",
  sev2: "bg-warning/15 text-warning",
  sev3: "bg-muted text-muted-foreground",
} as const;

function IncidentsPage() {
  const { incidents, selected } = Route.useLoaderData();
  const { id } = Route.useSearch();

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col">
        <h1 className="panel-rise mb-4 font-heading text-xl font-semibold tracking-tight">
          Incidents
        </h1>
        <Card className="panel-rise panel-rise-1 min-h-0 gap-0 overflow-y-auto py-2">
          <CardContent className="px-2">
            {incidents.length === 0 ? (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
                  </EmptyMedia>
                  <EmptyTitle>Inbox zero</EmptyTitle>
                  <EmptyDescription>
                    The incident-reporter agent files postmortems here when SLO burn alerts fire.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <Link
                      to="/incidents"
                      search={{ id: i.id }}
                      className={cn(
                        "block rounded-lg px-3 py-2.5 transition-colors hover:bg-muted",
                        id === i.id && "bg-muted ring-1 ring-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className={SEV_STYLES[i.severity]}>
                          {i.severity}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={
                            i.status === "resolved"
                              ? "bg-success/15 text-success"
                              : "bg-warning/15 text-warning"
                          }
                        >
                          {i.status}
                        </Badge>
                        {i.id.startsWith("sample-") ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            sample
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-foreground/90">{i.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
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
          <Empty className="mt-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>Select an incident</EmptyTitle>
              <EmptyDescription>
                The reporter agent's postmortem renders here, with links back to the source traces
                and logs.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="panel-rise panel-rise-2">
            <CardHeader className="border-b">
              <CardTitle>Postmortem</CardTitle>
              <span className="font-mono text-xs text-muted-foreground">{selected.id}</span>
            </CardHeader>
            <CardContent className="pt-1">
              {selected.postmortemMd !== undefined ? (
                <Markdown className="typeset-docs">{selected.postmortemMd}</Markdown>
              ) : (
                <Markdown className="typeset-docs">{selected.summary}</Markdown>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
