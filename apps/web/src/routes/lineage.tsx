import { createFileRoute } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import { publicConfig } from "~/lib/public-config";

export const Route = createFileRoute("/lineage")({
  component: LineagePage,
});

function LineagePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="text-xs text-muted-foreground">OpenLineage · Marquez</span>
        <a
          href={publicConfig.marquezUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open full UI
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>
      <iframe
        src={publicConfig.marquezUrl}
        title="Marquez lineage"
        className="w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
