import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpenIcon, PlayIcon, WrenchIcon, ZapIcon } from "lucide-react";
import { useState } from "react";
import { Markdown } from "~/components/markdown";
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
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "~/components/ui/frame";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { tenantStore } from "~/lib/tenant";
import { getRunbooks, runRunbookExecutor } from "~/server/functions";

export const Route = createFileRoute("/runbooks")({
  loader: () => getRunbooks(),
  component: RunbooksPage,
});

/** Shared row treatment for the selectable lists on the master–detail pages:
 * hover, keyboard focus, and the selected state all read the same way. */
const LIST_ROW =
  "block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors " +
  "outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60";
const LIST_ROW_SELECTED = "bg-muted ring-1 ring-primary/40";

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
      <Frame spacing="sm" className="panel-rise min-h-0">
        <FrameHeader className="justify-between">
          <h1 className="font-heading text-base font-semibold tracking-tight">Runbooks</h1>
          <span className="text-[11px] tabular-nums text-muted-foreground">{runbooks.length}</span>
        </FrameHeader>
        <FramePanel className="flex min-h-0 flex-col p-0">
          <ScrollArea className="min-h-0 flex-1" viewportClassName="overscroll-contain p-1.5">
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
                      aria-pressed={selectedSlug === rb.slug}
                      onClick={() => setSelectedSlug(rb.slug)}
                      className={cn(LIST_ROW, selectedSlug === rb.slug && LIST_ROW_SELECTED)}
                    >
                      <p className="text-sm font-medium text-foreground/90">{rb.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{rb.slug}.md</p>
                    </button>
                  </li>
                ))}
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
                <BookOpenIcon />
              </EmptyMedia>
              <EmptyTitle>Select a runbook</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Frame className="panel-rise panel-rise-2">
            <FrameHeader>
              <div className="min-w-0 flex-1">
                <FrameTitle className="truncate">{selected.title}</FrameTitle>
                <FrameDescription className="truncate font-mono text-xs">
                  {selected.slug}.md · runbook-executor
                </FrameDescription>
              </div>
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
            </FrameHeader>

            {launchError !== null ? (
              <FramePanel
                fit
                role="alert"
                className="border-destructive/40 bg-destructive/10 py-2.5 text-xs text-destructive"
              >
                {launchError}
              </FramePanel>
            ) : null}

            {/* The file's frontmatter, structured: which alerts route here and
                what toolset the executor is narrowed to — instead of the raw
                YAML block rendering as garbled prose above the doc. */}
            {selected.alertTypes.length > 0 || selected.tools.length > 0 ? (
              <FramePanel fit className="flex flex-col gap-2 py-3">
                {selected.alertTypes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <ZapIcon className="size-3" aria-hidden />
                      Triggers
                    </span>
                    {selected.alertTypes.map((alert) => (
                      <Badge key={alert} variant="secondary" className="bg-warning/10 text-warning">
                        {alert}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {selected.tools.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <WrenchIcon className="size-3" aria-hidden />
                      Tools
                    </span>
                    {selected.tools.map((tool) => (
                      <Badge
                        key={tool}
                        variant="outline"
                        className="font-mono text-muted-foreground"
                      >
                        {tool}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </FramePanel>
            ) : null}

            <FramePanel className="px-6 py-5">
              <Markdown className="typeset-docs">{selected.content}</Markdown>
            </FramePanel>
          </Frame>
        )}
      </ScrollArea>
    </div>
  );
}
