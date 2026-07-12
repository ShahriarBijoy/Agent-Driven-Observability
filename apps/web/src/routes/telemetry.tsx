import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { publicConfig } from "~/lib/public-config";
import { themeStore } from "~/lib/theme";
import { grafanaRangeParams, timeRangeStore } from "~/lib/time-range";
import { cn } from "~/lib/utils";

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
  const theme = themeStore.use();

  // kiosk mode strips Grafana chrome; anonymous auth means no login prompt.
  // The embed follows the app theme so a light control plane gets light charts.
  const src = `${publicConfig.grafanaUrl}/d/${active}/${active}?kiosk&theme=${theme}&${grafanaRangeParams(range)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-4 py-2">
        {DASHBOARDS.map((d) => (
          <button
            key={d.uid}
            type="button"
            onClick={() => setActive(d.uid)}
            className={cn(
              "cursor-pointer rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              active === d.uid
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Grafana · kiosk · now-{range}</span>
      </div>
      <iframe
        key={src}
        src={src}
        title={`Grafana — ${active}`}
        className="w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
