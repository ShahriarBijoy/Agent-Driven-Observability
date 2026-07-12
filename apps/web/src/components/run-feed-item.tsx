import type { Approval, Artifact, ToolCall } from "@obs/contracts";
import {
  ChevronDownIcon,
  FileCodeIcon,
  FileTextIcon,
  Maximize2Icon,
  ShieldAlertIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "~/components/ai-elements/tool";
import { Markdown } from "~/components/markdown";
import { TimeAgo } from "~/components/time-ago";
import { Badge } from "~/components/ui/badge";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Message, MessageContent } from "~/components/ui/message";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Spinner } from "~/components/ui/spinner";
import type { RunFeedBlock } from "~/lib/run-feed";
import { cn } from "~/lib/utils";

/**
 * Renders one block of the interleaved agent transcript. Shared by the run
 * detail page (persisted feed) and the live chat page (streaming feed) so a
 * run looks the same while it happens and after it's stored. Consecutive tool
 * calls arrive pre-grouped (groupRunFeed) and render as one collapsed row.
 */
export function RunFeedItem({
  block,
  streaming = false,
  onOpenArtifact,
}: {
  block: RunFeedBlock;
  streaming?: boolean;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  switch (block.kind) {
    case "message":
      return block.message.role === "user" ? (
        <Message align="end">
          <MessageContent>
            <Bubble align="end" variant="secondary">
              <BubbleContent className="whitespace-pre-wrap">
                {block.message.content}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <Markdown className={cn("typeset-chat", streaming && "stream-caret")}>
          {block.message.content}
        </Markdown>
      );
    case "tools":
      return <FeedToolGroup toolCalls={block.toolCalls} />;
    case "approval":
      return <FeedApproval approval={block.approval} />;
    case "artifact":
      return <ArtifactChip artifact={block.artifact} onOpen={onOpenArtifact} />;
  }
}

// Our contract's tool status → the AI Elements state vocabulary.
const TOOL_STATE = {
  pending: "input-available",
  ok: "output-available",
  error: "output-error",
} as const;

/**
 * One collapsed row per run of consecutive tool calls: "N tool calls" with a
 * status glance; expanding reveals the individual calls inside a capped
 * scroll area, each still openable for its parameters and result. Styled to
 * recede — process scaffolding, not a deliverable (contrast ArtifactChip).
 */
function FeedToolGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const running = toolCalls.filter((tc) => tc.status === "pending").length;
  const errors = toolCalls.filter((tc) => tc.status === "error").length;
  const names = [...new Set(toolCalls.map((tc) => tc.name))].join(", ");

  return (
    <Collapsible className="group/tools not-prose w-full overflow-hidden rounded-lg bg-muted/40">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2 transition-colors hover:bg-muted/60">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          {running > 0 ? (
            <Spinner className="size-3.5 shrink-0" />
          ) : (
            <WrenchIcon className="size-3.5 shrink-0" />
          )}
          <span className="shrink-0 text-xs font-medium">
            {toolCalls.length} tool call{toolCalls.length === 1 ? "" : "s"}
          </span>
          <span className="truncate font-mono text-[11px]">{names}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {errors > 0 ? (
            <Badge className="gap-1 rounded-full text-[11px]" variant="secondary">
              <XCircleIcon className="size-3.5 text-red-600" />
              {errors} failed
            </Badge>
          ) : null}
          <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-has-[[data-panel-open]]/tools:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2">
        <ScrollArea viewportClassName="max-h-80">
          <div className="flex flex-col gap-3 p-3 pt-1">
            {toolCalls.map((tc) => (
              <FeedToolCall key={tc.id} toolCall={tc} />
            ))}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FeedToolCall({ toolCall: tc }: { toolCall: ToolCall }) {
  const duration =
    tc.endedAt === undefined
      ? undefined
      : `${Math.max(0, Date.parse(tc.endedAt) - Date.parse(tc.startedAt))}ms`;

  return (
    <Tool className="mb-0" defaultOpen={tc.status === "error"}>
      <ToolHeader
        type={`tool-${tc.name}`}
        title={tc.name}
        state={TOOL_STATE[tc.status]}
        meta={
          duration === undefined ? undefined : (
            <span className="font-mono text-[11px] text-muted-foreground">{duration}</span>
          )
        }
      />
      <ToolContent>
        <ToolInput input={tc.args} />
        <ToolOutput
          output={tc.status === "error" ? undefined : tc.result}
          errorText={tc.status === "error" ? tc.result : undefined}
        />
      </ToolContent>
    </Tool>
  );
}

function FeedApproval({ approval }: { approval: Approval }) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <ShieldAlertIcon className="size-4 text-warning" />
        Approval gate
        {approval.decision === undefined ? (
          <Badge variant="outline" className="text-warning">
            pending
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={approval.decision === "approved" ? "text-success" : "text-destructive"}
          >
            {approval.decision}
          </Badge>
        )}
        <span className="text-xs font-normal text-muted-foreground">
          <TimeAgo iso={approval.decidedAt ?? approval.requestedAt} />
        </span>
      </p>
      <p className="mt-1.5 text-sm text-foreground/90">{approval.summary}</p>
    </div>
  );
}

// Chip subtitle + icon per artifact type. The panel does the actual rendering.
const ARTIFACT_CHIP: Record<Artifact["mediaType"], { label: string; icon: typeof FileCodeIcon }> = {
  "text/html": { label: "Rendered page", icon: FileCodeIcon },
  "text/markdown": { label: "Markdown report", icon: FileTextIcon },
  "application/json": { label: "JSON data", icon: FileCodeIcon },
};

/**
 * Claude-style chip for artifacts — click to open in the side panel. The full
 * content never renders inline, so a saved report doesn't repeat the
 * assistant's closing message. Styled to stand out from tool-call rows: this
 * is the run's deliverable, so it gets the primary accent and an icon tile.
 */
function ArtifactChip({
  artifact,
  onOpen,
}: {
  artifact: Artifact;
  onOpen?: (artifact: Artifact) => void;
}) {
  const { label, icon: Icon } = ARTIFACT_CHIP[artifact.mediaType];
  return (
    <button
      type="button"
      onClick={() => onOpen?.(artifact)}
      className="group flex w-full items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/10"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm font-semibold">{artifact.name}</span>
        <span className="text-xs text-muted-foreground">{label} · click to open</span>
      </span>
      <Maximize2Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  );
}
