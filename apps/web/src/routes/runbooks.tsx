import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, cn } from "@obs/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Markdown } from "~/components/markdown";
import { readAgentStream } from "~/lib/sse";
import { tenantStore } from "~/lib/tenant";
import { getRunbooks } from "~/server/functions";

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

  const selected = runbooks.find((r) => r.slug === selectedSlug) ?? null;

  async function runWithExecutor(slug: string) {
    setLaunching(slug);
    try {
      // The executor pauses at an approval gate before touching anything;
      // the echo agent honors the same protocol until Phase 5.
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent: "runbook-executor",
          tenant,
          message: `Execute runbook "${slug}" — request approval before applying changes.`,
        }),
      });
      let runId: string | null = null;
      for await (const event of readAgentStream(res)) {
        if (event.type === "run") runId = event.runId;
      }
      if (runId !== null) {
        void navigate({ to: "/agents/runs/$runId", params: { runId } });
      }
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[320px_1fr]">
      <div>
        <h1 className="panel-rise mb-4 font-display text-2xl font-medium text-ink">Runbooks</h1>
        <Card className="panel-rise panel-rise-1">
          <CardContent className="p-0">
            {runbooks.length === 0 ? (
              <EmptyState
                className="m-3 border-0"
                title="no runbooks"
                detail="Drop Markdown files into runbooks/ at the repo root."
              />
            ) : (
              <ul>
                {runbooks.map((rb) => (
                  <li key={rb.slug} className="border-b border-rule-soft last:border-0">
                    <button
                      type="button"
                      onClick={() => setSelectedSlug(rb.slug)}
                      className={cn(
                        "block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-elev/60",
                        selectedSlug === rb.slug && "border-l-2 border-l-signal bg-signal/5",
                      )}
                    >
                      <p className="text-sm text-ink-dim">{rb.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-faint">{rb.slug}.md</p>
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
          <EmptyState className="mt-14" title="select a runbook" />
        ) : (
          <Card className="panel-rise panel-rise-2">
            <CardHeader>
              <CardTitle>{selected.slug}.md</CardTitle>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">runbook-executor</Badge>
                <Button
                  variant="signal"
                  size="sm"
                  disabled={launching !== null}
                  onClick={() => void runWithExecutor(selected.slug)}
                >
                  {launching === selected.slug ? "starting…" : "run with executor"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Markdown>{selected.content}</Markdown>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
