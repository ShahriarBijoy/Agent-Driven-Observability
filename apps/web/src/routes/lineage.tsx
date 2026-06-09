import { createFileRoute } from "@tanstack/react-router";
import { publicConfig } from "~/lib/public-config";

export const Route = createFileRoute("/lineage")({
  component: LineagePage,
});

function LineagePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-rule-soft px-4 py-2">
        <span className="font-mono text-[11px] tracking-[0.1em] text-ink-faint uppercase">
          openlineage · marquez
        </span>
        <a
          href={publicConfig.marquezUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-signal-dim uppercase hover:text-signal"
        >
          open full ui ↗
        </a>
      </div>
      <iframe
        src={publicConfig.marquezUrl}
        title="Marquez lineage"
        className="w-full flex-1 border-0 bg-bg"
      />
    </div>
  );
}
