import type { Artifact } from "@obs/contracts";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";
import {
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
  Artifact as ArtifactPanelRoot,
} from "~/components/ai-elements/artifact";
import { CodeBlock } from "~/components/ai-elements/code-block";
import { Markdown } from "~/components/markdown";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { downloadArtifact, languageFor, wrapArtifactHtml } from "~/lib/artifact-view";
import { cn } from "~/lib/utils";

type View = "preview" | "code";

/**
 * Split-pane artifact viewer. HTML previews render in a sandboxed iframe:
 * allow-scripts WITHOUT allow-same-origin (unique opaque origin — no cookies,
 * no storage, no parent DOM) plus a CSP that blocks all network. See
 * ~/lib/artifact-view.ts for the threat model.
 */
export function ArtifactPanel({
  artifact,
  onClose,
  className,
}: {
  artifact: Artifact;
  onClose: () => void;
  className?: string;
}) {
  const [view, setView] = useState<View>("preview");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ArtifactPanelRoot className={cn("min-h-0", className)}>
      <ArtifactHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ArtifactTitle className="truncate font-mono">{artifact.name}</ArtifactTitle>
          <Badge variant="outline" className="text-muted-foreground">
            {artifact.mediaType}
          </Badge>
        </div>
        <ArtifactActions>
          <div className="mr-1 flex items-center rounded-md border p-0.5">
            <Button
              size="xs"
              variant={view === "preview" ? "secondary" : "ghost"}
              onClick={() => setView("preview")}
            >
              Preview
            </Button>
            <Button
              size="xs"
              variant={view === "code" ? "secondary" : "ghost"}
              onClick={() => setView("code")}
            >
              Code
            </Button>
          </div>
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
          <ArtifactClose onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      {view === "code" ? (
        <ArtifactContent className="p-0">
          <CodeBlock
            code={artifact.content}
            language={languageFor(artifact.mediaType)}
            className="rounded-none border-0"
          />
        </ArtifactContent>
      ) : artifact.mediaType === "text/html" ? (
        <iframe
          title={artifact.name}
          sandbox="allow-scripts"
          srcDoc={wrapArtifactHtml(artifact.content)}
          className="min-h-0 w-full flex-1 border-0 bg-background"
        />
      ) : artifact.mediaType === "text/markdown" ? (
        <ArtifactContent className="px-5 py-4">
          <Markdown className="typeset-docs">{artifact.content}</Markdown>
        </ArtifactContent>
      ) : (
        <ArtifactContent className="p-0">
          <CodeBlock code={artifact.content} language="json" className="rounded-none border-0" />
        </ArtifactContent>
      )}
    </ArtifactPanelRoot>
  );
}
