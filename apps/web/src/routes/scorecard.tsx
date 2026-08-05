import type { ExamResult } from "@obs/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CheckIcon, GraduationCapIcon, MinusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  buildScorecard,
  CRITERIA,
  criterionTotals,
  formatAccuracy,
  formatSeconds,
  pooledAccuracy,
  type ScoredRun,
} from "~/lib/scorecard";
import { useMountEffect } from "~/lib/use-mount-effect";
import { cn } from "~/lib/utils";
import { getScorecard } from "~/server/functions";

export const Route = createFileRoute("/scorecard")({
  loader: () => getScorecard(),
  component: ScorecardPage,
});

/** The three non-graded statuses, each said plainly. They are findings about
 * the lab or the harness, not about the agent's reasoning, and the page keeps
 * that distinction visible rather than averaging it away. */
const STATUS_META = {
  not_run: {
    label: "not run",
    className: "bg-muted text-muted-foreground",
    hint: "the Claude session died — the question was never asked",
  },
  no_alert: {
    label: "no alert",
    className: "bg-warning/15 text-warning",
    hint: "nothing fired in time — an observability finding, not a wrong answer",
  },
  error: {
    label: "error",
    className: "bg-destructive/10 text-destructive",
    hint: "inject, revert or judge failed — the scenario was unusable",
  },
} as const;

function scoreClassName(score: number): string {
  if (score === CRITERIA.length) return "bg-success/15 text-success";
  if (score === 0) return "bg-destructive/10 text-destructive";
  return "bg-warning/15 text-warning";
}

function ScorecardPage() {
  const { runs, results } = Route.useLoaderData();
  const router = useRouter();
  const cards = buildScorecard(runs, results);
  const pooled = pooledAccuracy(cards);
  const totals = criterionTotals(results);

  // An exam run lands its rows minutes apart — one scenario is ~10 minutes of
  // inject, alert, investigate, revert and judge — so this refreshes slowly.
  // Watching a sweep fill in is the point; 2.5s like /oncall would be noise.
  useMountEffect(() => {
    const timer = setInterval(() => void router.invalidate(), 10_000);
    return () => clearInterval(timer);
  });

  if (runs.length === 0) {
    return (
      <Empty className="mt-20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GraduationCapIcon />
          </EmptyMedia>
          <EmptyTitle>No exams yet</EmptyTitle>
          <EmptyDescription>
            Run <code className="font-mono text-xs">obs exam config</code> to inject a known fault,
            let the on-call agent investigate it blind, and grade the report against a hidden key.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const gradedRows = results.filter((r) => r.status === "graded").length;

  return (
    // max-w-6xl matches /oncall and /incidents, and the scenario table needs
    // every pixel of it: ten columns, three of them run links.
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
      <Frame className="panel-rise">
        <FrameHeader className="flex-col items-start gap-1">
          <div className="flex w-full flex-wrap items-baseline justify-between gap-3">
            <FrameTitle className="flex items-center gap-2 font-heading text-base">
              <GraduationCapIcon className="size-4 text-primary" aria-hidden />
              Scorecard
            </FrameTitle>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-semibold tabular-nums">
                {formatAccuracy(pooled)}
              </span>
              <span className="text-xs text-muted-foreground">
                across {gradedRows} graded scenario{gradedRows === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <FrameDescription className="text-xs">
            Accuracy counts <strong>graded scenarios only</strong>. A question the agent never saw,
            an alert that never fired, or a scenario that failed to inject says nothing about how
            well it reasons — those are listed, never averaged in.
          </FrameDescription>
        </FrameHeader>

        <FramePanel fit>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
            Trend across runs
          </p>
          <TrendStrip cards={[...cards].reverse()} />
        </FramePanel>

        {totals.graded > 0 ? (
          <FramePanel fit>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
              Where the marks go
            </p>
            <ul className="flex flex-col gap-1.5">
              {CRITERIA.map((c) => {
                const met = totals[c.key];
                const pct = Math.round((met / totals.graded) * 100);
                return (
                  <li key={c.key} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 text-muted-foreground">{c.label}</span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                      {met}/{totals.graded}
                    </span>
                  </li>
                );
              })}
            </ul>
          </FramePanel>
        ) : null}
      </Frame>

      {cards.map((card, index) => (
        // Only the newest run can still be running: the exam is strictly
        // sequential (one fault live at a time), so a later run existing is
        // proof an earlier unfinished one was interrupted. That beats guessing
        // from wall-clock age, and needs no clock at render time.
        <RunCard key={card.run.id} card={card} newest={index === 0} />
      ))}
    </div>
  );
}

/** One column per run, oldest on the left. A run that graded nothing draws a
 * dashed empty track rather than a zero-height bar — no bar and a 0% bar mean
 * very different things. */
function TrendStrip({ cards }: { cards: ScoredRun[] }) {
  return (
    <ol className="flex items-end gap-2 overflow-x-auto pb-1">
      {cards.map((card) => (
        <li key={card.run.id} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="flex h-16 w-full items-end rounded-md bg-muted/60 p-0.5">
            {card.accuracy === null ? (
              <span className="h-full w-full rounded border border-dashed border-muted-foreground/40" />
            ) : (
              <span
                className="w-full rounded bg-primary/70"
                // A perfect 0% would be invisible; floor the bar so a scored
                // zero still reads as a bar the eye can find.
                style={{ height: `${Math.max(card.accuracy * 100, 4)}%` }}
              />
            )}
          </span>
          <span className="font-mono text-[11px] tabular-nums">
            {formatAccuracy(card.accuracy)}
          </span>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {card.run.group}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RunCard({ card, newest }: { card: ScoredRun; newest: boolean }) {
  const { run } = card;
  // No finish record means the runner never reached its `finally` — either it
  // is still going or it was killed. See the call site for which is which.
  const unfinished = run.finishedAt === undefined;
  return (
    <Frame className="panel-rise panel-rise-2">
      <FrameHeader className="flex-col items-start gap-1">
        <div className="flex w-full flex-wrap items-center gap-2">
          <FrameTitle className="text-sm">{run.group}</FrameTitle>
          <Badge variant="secondary" className={cn("tabular-nums", statusTone(card))}>
            {card.possible === 0 ? "no grades" : `${card.scored}/${card.possible}`}
          </Badge>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatAccuracy(card.accuracy)}
          </span>
          {unfinished ? (
            newest ? (
              <Badge variant="outline" className="text-warning">
                in flight
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground" title="no finish record">
                interrupted
              </Badge>
            )
          ) : null}
          {card.cheated > 0 ? (
            <Badge variant="destructive">{card.cheated} cheated — scored 0</Badge>
          ) : null}
        </div>
        <FrameDescription className="text-xs">
          <span className="font-mono">{run.id}</span> · started <TimeAgo iso={run.startedAt} />
          {run.gitSha !== "" ? (
            <>
              {" "}
              · <span className="font-mono">{run.gitSha}</span>
            </>
          ) : null}
          {card.notRun + card.noAlert + card.errored > 0 ? (
            <>
              {" · "}
              <span className="text-muted-foreground">
                {[
                  card.noAlert > 0 ? `${card.noAlert} no-alert` : null,
                  card.errored > 0 ? `${card.errored} error` : null,
                  card.notRun > 0 ? `${card.notRun} not-run` : null,
                ]
                  .filter((part) => part !== null)
                  .join(", ")}
              </span>
            </>
          ) : null}
        </FrameDescription>
      </FrameHeader>

      <FramePanel fit className="p-0">
        {card.results.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            No result rows — this run was interrupted before it recorded a scenario.
          </p>
        ) : (
          <ScenarioTable results={card.results} />
        )}
      </FramePanel>
    </Frame>
  );
}

function statusTone(card: ScoredRun): string {
  if (card.possible === 0) return "bg-muted text-muted-foreground";
  return scoreClassName(Math.round((card.scored / card.possible) * CRITERIA.length));
}

function ScenarioTable({ results }: { results: ExamResult[] }) {
  // Which rationale is open. One at a time: they run to a few hundred words
  // and the value is in reading one closely, not in scanning four at once.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Scenario</TableHead>
          <TableHead>Result</TableHead>
          {CRITERIA.map((c) => (
            <TableHead key={c.key} className="text-center" title={c.label}>
              {c.short}
            </TableHead>
          ))}
          <TableHead className="text-right">Alert</TableHead>
          <TableHead className="text-right">Diagnosis</TableHead>
          <TableHead className="text-right">Turns</TableHead>
          <TableHead>Links</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((r) => {
          const rowKey = r.id ?? r.scenarioId;
          const isOpen = openId === rowKey;
          const rationale = r.judgeRationale;
          return [
            <TableRow key={rowKey}>
              <TableCell className="font-mono text-xs">
                {rationale !== undefined ? (
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : rowKey)}
                    aria-expanded={isOpen}
                    className="rounded text-left underline decoration-dotted underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {r.scenarioId}
                  </button>
                ) : (
                  r.scenarioId
                )}
              </TableCell>
              <TableCell>
                <ResultBadge result={r} />
              </TableCell>
              {CRITERIA.map((c) => (
                <TableCell key={c.key} className="text-center">
                  <Verdict value={r[c.key]} />
                </TableCell>
              ))}
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatSeconds(r.timeToAlertS)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatSeconds(r.timeToDiagnosisS)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {r.turns ?? "—"}
                {r.toolCalls !== undefined ? (
                  <span className="text-muted-foreground"> / {r.toolCalls}</span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <RunLinks result={r} />
              </TableCell>
            </TableRow>,
            isOpen && rationale !== undefined ? (
              <TableRow key={`${rowKey}-rationale`} className="hover:bg-transparent">
                {/* Scenario, Result, the four criteria, Alert, Diagnosis,
                    Turns, Links — span them all or the row leaves a gap. */}
                <TableCell colSpan={6 + CRITERIA.length} className="bg-muted/40">
                  <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                    Judge rationale
                  </p>
                  {/* Plain text, not <Markdown>: the judge writes prose keyed
                      by criterion name and any stray * or _ in a quoted report
                      would otherwise render as emphasis. */}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {rationale}
                  </p>
                </TableCell>
              </TableRow>
            ) : null,
          ];
        })}
      </TableBody>
    </Table>
  );
}

function ResultBadge({ result }: { result: ExamResult }) {
  if (result.status !== "graded") {
    const meta = STATUS_META[result.status];
    return (
      <Badge variant="secondary" className={meta.className} title={meta.hint}>
        {meta.label}
      </Badge>
    );
  }
  const score = result.score ?? 0;
  return (
    <span className="flex items-center gap-1.5">
      <Badge variant="secondary" className={cn("tabular-nums", scoreClassName(score))}>
        {score}/{CRITERIA.length}
      </Badge>
      {result.cheated === true ? (
        <Badge variant="destructive" title="read the answer key — score forced to 0">
          cheated
        </Badge>
      ) : null}
    </span>
  );
}

/** A criterion the judge did not rule on (an ungraded row) is a dash, never a
 * cross: "not asked" and "got it wrong" must not look alike. */
function Verdict({ value }: { value: boolean | undefined }) {
  if (value === undefined) {
    return (
      <MinusIcon className="inline size-3.5 text-muted-foreground/50" aria-label="not graded" />
    );
  }
  return value ? (
    <CheckIcon className="inline size-3.5 text-success" aria-label="met" />
  ) : (
    <XIcon className="inline size-3.5 text-destructive" aria-label="not met" />
  );
}

const LINK_CLASS =
  "rounded font-mono text-[11px] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60";

/** The three run links the exam records, so a grade can always be traced back
 * to the investigation it graded and the judgement that scored it. */
function RunLinks({ result }: { result: ExamResult }) {
  return (
    <span className="flex items-center gap-2">
      {result.incidentId !== undefined ? (
        <Link to="/oncall" search={{ id: result.incidentId }} className={LINK_CLASS}>
          incident
        </Link>
      ) : null}
      {result.agentRunId !== undefined ? (
        <Link to="/agents/runs/$runId" params={{ runId: result.agentRunId }} className={LINK_CLASS}>
          run
        </Link>
      ) : null}
      {result.judgeRunId !== undefined ? (
        <Link to="/agents/runs/$runId" params={{ runId: result.judgeRunId }} className={LINK_CLASS}>
          judge
        </Link>
      ) : null}
    </span>
  );
}
