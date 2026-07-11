import type { Approval, Artifact, ToolCall } from "@obs/contracts";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileCodeIcon,
  Maximize2Icon,
  ShieldAlertIcon,
} from "lucide-react";
import { useState } from "react";
import {
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
  Artifact as ArtifactPanel,
} from "~/components/ai-elements/artifact";
import { CodeBlock } from "~/components/ai-elements/code-block";
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
import { Message, MessageContent } from "~/components/ui/message";
import { downloadArtifact } from "~/lib/artifact-view";
import type { RunFeedPart } from "~/lib/run-feed";
import { cn } from "~/lib/utils";

/**
 * Renders one part of the interleaved agent transcript. Shared by the run
 * detail page (persisted feed) and the live chat page (streaming feed) so a
 * run looks the same while it happens and after it's stored.
 */
export function RunFeedItem({
  part,
  streaming = false,
  onOpenArtifact,
}: {
  part: RunFeedPart;
  streaming?: boolean;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  switch (part.kind) {
    case "message":
      return part.message.role === "user" ? (
        <Message align="end">
          <MessageContent>
            <Bubble align="end" variant="secondary">
              <BubbleContent className="whitespace-pre-wrap">
                {part.message.content}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <Markdown className={cn("typeset-chat", streaming && "stream-caret")}>
          {part.message.content}
        </Markdown>
      );
    case "tool":
      return <FeedToolCall toolCall={part.toolCall} />;
    case "approval":
      return <FeedApproval approval={part.approval} />;
    case "artifact":
      return part.artifact.mediaType === "text/html" ? (
        <ArtifactChip artifact={part.artifact} onOpen={onOpenArtifact} />
      ) : (
        <ArtifactCard artifact={part.artifact} onOpen={onOpenArtifact} />
      );
  }
}

// Our contract's tool status → the AI Elements state vocabulary.
const TOOL_STATE = {
  pending: "input-available",
  ok: "output-available",
  error: "output-error",
} as const;

function FeedToolCall({ toolCall: tc }: { toolCall: ToolCall }) {
  const duration =
    tc.endedAt === undefined
      ? undefined
      : `${Math.max(0, Date.parse(tc.endedAt) - Date.parse(tc.startedAt))}ms`;

  return (
    <Tool defaultOpen={tc.status === "error"}>
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

/** Compact Claude-style chip for rendered (HTML) artifacts — click to open. */
function ArtifactChip({
  artifact,
  onOpen,
}: {
  artifact: Artifact;
  onOpen?: (artifact: Artifact) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(artifact)}
      className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-ring/40 hover:bg-muted/50"
    >
      <FileCodeIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm font-medium">{artifact.name}</span>
        <span className="text-xs text-muted-foreground">Rendered page · click to open</span>
      </span>
      <Maximize2Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  );
}

export function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: Artifact;
  onOpen?: (artifact: Artifact) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ArtifactPanel>
      <ArtifactHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ArtifactTitle className="truncate font-mono">{artifact.name}</ArtifactTitle>
          <Badge variant="outline" className="text-muted-foreground">
            {artifact.mediaType}
          </Badge>
        </div>
        <ArtifactActions>
          {onOpen !== undefined ? (
            <ArtifactAction
              icon={Maximize2Icon}
              tooltip="Open in panel"
              label="Open in side panel"
              onClick={() => onOpen(artifact)}
            />
          ) : null}
          <ArtifactAction
            icon={copied ? CheckIcon : CopyIcon}
            tooltip={copied ? "Copied" : "Copy contents"}
            label="Copy artifact contents"
            onClick={() => void copy()}
          />
          <ArtifactAction
            icon={DownloadIcon}
            tooltip="Download"
            label="Download artifact"
            onClick={() => downloadArtifact(artifact)}
          />
        </ArtifactActions>
      </ArtifactHeader>
      {artifact.mediaType === "text/markdown" ? (
        <ArtifactContent className="px-5 py-4">
          <Markdown className="typeset-docs">{artifact.content}</Markdown>
        </ArtifactContent>
      ) : (
        <ArtifactContent className="p-0">
          <CodeBlock
            code={artifact.content}
            language="json"
            className="rounded-none border-0"
          />
        </ArtifactContent>
      )}
    </ArtifactPanel>
  );
}
