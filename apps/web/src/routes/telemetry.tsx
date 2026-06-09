import { cn } from "@obs/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { publicConfig } from "~/lib/public-config";
import { grafanaRangeParams, timeRangeStore } from "~/lib/time-range";

/** Provisioned dashboards (infra/grafana/provisioning/dashboards). */
const DASHBOARDS = [
  { uid: "gateway-red", label: "Gateway RED" },
  { uid: "rag-pipeline", label: "RAG Pipeline" },
  { uid: "data-quality", label: "Data Quality" },
] as const;

export const Route = createFileRoute("/telemetry")({
  component: TelemetryPage,
});

function TelemetryPage() {
  const [active, setActive] = useState<(typeof DASHBOARDS)[number]["uid"]>("gateway-red");
  const range = timeRangeStore.use();

  // kiosk mode strips Grafana chrome; anonymous auth means no login prompt.
  const src = `${publicConfig.grafanaUrl}/d/${active}/${active}?kiosk&theme=dark&${grafanaRangeParams(range)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-rule-soft px-4 py-2">
        {DASHBOARDS.map((d) => (
          <button
            key={d.uid}
            type="button"
            onClick={() => setActive(d.uid)}
            className={cn(
              "cursor-pointer rounded-sm px-3 py-1 font-mono text-[11px] tracking-[0.1em] uppercase transition-colors",
              active === d.uid ? "bg-signal/10 text-signal" : "text-ink-faint hover:text-ink-dim",
            )}
          >
            {d.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-ink-faint uppercase">
          grafana · kiosk · now-{range}
        </span>
      </div>
      <iframe
        key={src}
        src={src}
        title={`Grafana — ${active}`}
        className="w-full flex-1 border-0 bg-bg"
      />
    </div>
  );
}
