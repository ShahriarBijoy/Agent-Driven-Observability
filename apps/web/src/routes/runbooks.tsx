import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpenIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { Markdown } from "~/components/markdown";
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
import { cn } from "~/lib/utils";
import { tenantStore } from "~/lib/tenant";
import { getRunbooks, runRunbookExecutor } from "~/server/functions";

export const Route = createFileRoute("/runbooks")({
  loader: () => getRunbooks(),
  component: RunbooksPage,
});

function RunbooksPage() {
  const runbooks = Route.useLoaderData();
  const navigate = useNavigate();
  const tenant = tenantStore.use();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(runbooks[0]?.slug ?? null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const selected = runbooks.find((r) => r.slug === selectedSlug) ?? null;

  async function runWithExecutor(slug: string) {
    setLaunching(slug);
    setLaunchError(null);
    try {
      // Triggered run, not a chat: the executor pauses at an approval gate
      // before any mutating step; you approve/deny on the run page.
      const { runId } = await runRunbookExecutor({ data: { name: `${slug}.md`, tenant } });
      if (runId === null) {
        setLaunchError(
          "agent-service (:8093) didn't accept the run — is it up? Start it with `obs agents`.",
        );
        return;
      }
      void navigate({ to: "/agents/runs/$runId", params: { runId } });
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <h1 className="panel-rise mb-4 font-heading text-xl font-semibold tracking-tight">
          Runbooks
        </h1>
        <Card className="panel-rise panel-rise-1 gap-0 py-2">
          <CardContent className="px-2">
            {runbooks.length === 0 ? (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpenIcon />
                  </EmptyMedia>
                  <EmptyTitle>No runbooks</EmptyTitle>
                  <EmptyDescription>
                    Drop Markdown files into runbooks/ at the repo root.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {runbooks.map((rb) => (
                  <li key={rb.slug}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlug(rb.slug)}
                      className={cn(
                        "block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted",
                        selectedSlug === rb.slug && "bg-muted ring-1 ring-primary/40",
                      )}
                    >
                      <p className="text-sm font-medium text-foreground/90">{rb.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{rb.slug}.md</p>
                    </button>
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
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>Select a runbook</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="panel-rise panel-rise-2">
            <CardHeader className="border-b">
              <CardTitle className="font-mono text-sm">{selected.slug}.md</CardTitle>
              <CardAction className="flex items-center gap-2">
                <Badge variant="outline" className="text-muted-foreground">
                  runbook-executor
                </Badge>
                <Button
                  size="sm"
                  disabled={launching !== null}
                  onClick={() => void runWithExecutor(selected.slug)}
                >
                  {launching === selected.slug ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlayIcon data-icon="inline-start" />
                  )}
                  {launching === selected.slug ? "Starting" : "Run with executor"}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-1">
              {launchError !== null ? (
                <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {launchError}
                </p>
              ) : null}
              <Markdown className="typeset-docs">{selected.content}</Markdown>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
