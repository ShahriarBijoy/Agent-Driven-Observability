import type { Incident } from "@obs/contracts";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InboxIcon, WrenchIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Markdown } from "~/components/markdown";
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
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { autoFixIncident, getIncidentInbox } from "~/server/functions";

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
          <PostmortemCard key={selected.id} incident={selected} />
        )}
      </div>
    </div>
  );
}

/** The selected incident's postmortem plus the hand-off to the auto-fixer.
 * Keyed by incident id upstream so panel state resets on selection change. */
function PostmortemCard({ incident }: { incident: Incident }) {
  const navigate = useNavigate();
  const isSample = incident.id.startsWith("sample-");
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startAutoFix() {
    setStarting(true);
    setError(null);
    try {
      const guidance = instructions.trim();
      const { runId } = await autoFixIncident({
        data: {
          incidentId: incident.id,
          ...(guidance !== "" ? { instructions: guidance } : {}),
        },
      });
      if (runId === null) {
        setError("Could not start the run — is the agent-service up? Start it with `obs agents`.");
        return;
      }
      void navigate({ to: "/agents/runs/$runId", params: { runId } });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="panel-rise panel-rise-2">
      <CardHeader className="border-b">
        <CardTitle>Postmortem</CardTitle>
        <span className="font-mono text-xs text-muted-foreground">{incident.id}</span>
        <CardAction>
          {isSample ? (
            <span className="text-xs text-muted-foreground">
              sample incident — run a fail drill to file a real one
            </span>
          ) : (
            <Button
              size="sm"
              variant={open ? "secondary" : "default"}
              onClick={() => setOpen((v) => !v)}
            >
              <WrenchIcon data-icon="inline-start" />
              Auto-fix
            </Button>
          )}
        </CardAction>
      </CardHeader>
      {open ? (
        <div className="border-b px-6 pb-5">
          <p className="text-sm text-muted-foreground">
            Hands this incident to the auto-fixer: it investigates in a contained clone of the repo
            (never your working tree), proposes the smallest fix, and pauses for your approval
            before opening a PR. The postmortem rides along automatically.
          </p>
          <Textarea
            className="mt-3"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional guidance — where to look, what to change, constraints…"
            maxLength={4000}
          />
          {error !== null ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" disabled={starting} onClick={() => void startAutoFix()}>
              {starting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <WrenchIcon data-icon="inline-start" />
              )}
              {starting ? "Starting run" : "Start auto-fix run"}
            </Button>
            <span className="text-xs text-muted-foreground">
              You approve or deny the change on the run page.
            </span>
          </div>
        </div>
      ) : null}
      <CardContent className="pt-1">
        {incident.postmortemMd !== undefined ? (
          <Markdown className="typeset-docs">{incident.postmortemMd}</Markdown>
        ) : (
          <Markdown className="typeset-docs">{incident.summary}</Markdown>
        )}
      </CardContent>
    </Card>
  );
}
