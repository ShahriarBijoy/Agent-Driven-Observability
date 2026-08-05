import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import { z } from "zod";
import { dashboardUrl, effectiveRange, findDashboard, groupedDashboards } from "~/lib/dashboards";
import { publicConfig } from "~/lib/public-config";
import { themeStore } from "~/lib/theme";
import { timeRangeStore } from "~/lib/time-range";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/telemetry")({
  // The dashboard lives in the URL so a demo script, a runbook or a postmortem
  // can link straight at the panel that makes its point.
  validateSearch: z.object({ d: z.string().optional() }),
  component: TelemetryPage,
});

function TelemetryPage() {
  const { d } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const range = timeRangeStore.use();
  const theme = themeStore.use();

  const active = findDashboard(d);
  const groups = groupedDashboards();
  // Say so when the dashboard overrode the picker, rather than letting the
  // toolbar claim a window the charts aren't showing.
  const shown = effectiveRange(active, range);

  const embed = dashboardUrl({
    grafanaUrl: publicConfig.grafanaUrl,
    dashboard: active,
    theme,
    range,
  });
  const external = dashboardUrl({
    grafanaUrl: publicConfig.grafanaUrl,
    dashboard: active,
    theme,
    range,
    kiosk: false,
  });

  return (
    <div className="flex h-full">
      {/* A catalogue, not a menu: the whole tour stays visible while you talk over it. */}
      <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r bg-sidebar/40 py-3">
        {groups.map((g) => (
          <div key={g.group} className="mb-1 px-2">
            <p className="px-2 py-1 text-[10px] font-semibold tracking-[0.09em] text-muted-foreground/60 uppercase">
              {g.group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {g.dashboards.map((dash) => (
                <li key={dash.uid}>
                  {/* Same active vocabulary as the primary rail — filled row plus
                      an accent bar — so the two columns never read as peers. */}
                  <button
                    type="button"
                    onClick={() => navigate({ search: { d: dash.uid } })}
                    className={cn(
                      "relative w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-150 active:translate-y-px",
                      dash.uid === active.uid
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/45 hover:text-sidebar-foreground",
                    )}
                  >
                    {dash.uid === active.uid && (
                      <span
                        aria-hidden
                        className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                      />
                    )}
                    {dash.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-baseline gap-3 border-b px-4 py-2">
          <h1 className="font-heading text-sm font-semibold tracking-tight">{active.label}</h1>
          <p className="truncate text-xs text-muted-foreground">{active.caption}</p>
          <a
            href={external}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Grafana · kiosk · now-{shown}
            {shown !== range && <span className="text-muted-foreground/60">(min window)</span>}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
        </div>
        <iframe
          key={embed}
          src={embed}
          title={`Grafana — ${active.label}`}
          className="w-full flex-1 border-0 bg-background"
        />
      </div>
    </div>
  );
}
