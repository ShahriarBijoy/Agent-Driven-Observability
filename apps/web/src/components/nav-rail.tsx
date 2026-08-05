import { Link, useRouterState } from "@tanstack/react-router";
import {
  ActivityIcon,
  BookOpenIcon,
  BotIcon,
  GaugeIcon,
  GraduationCapIcon,
  RadioTowerIcon,
  SettingsIcon,
  SirenIcon,
  WaypointsIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";

/*
 * The nav is grouped by what the operator is doing, not by route order:
 * reading signals, working the live loop, reviewing the record, configuring.
 */
const GROUPS = [
  {
    label: "Signals",
    items: [
      { to: "/", label: "Overview", icon: GaugeIcon },
      { to: "/telemetry", label: "Telemetry", icon: ActivityIcon },
      { to: "/lineage", label: "Lineage", icon: WaypointsIcon },
    ],
  },
  {
    label: "Response",
    items: [
      { to: "/agents", label: "Agents", icon: BotIcon },
      { to: "/oncall", label: "On-call", icon: RadioTowerIcon },
      { to: "/runbooks", label: "Runbooks", icon: BookOpenIcon },
    ],
  },
  {
    label: "Record",
    items: [
      { to: "/incidents", label: "Incidents", icon: SirenIcon },
      { to: "/scorecard", label: "Scorecard", icon: GraduationCapIcon },
    ],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: SettingsIcon }],
  },
] as const;

/*
 * The active pill is one element that slides between rows, so its offset has to
 * be known during render — no measurement, no effect, correct on first paint.
 * That holds only while every row and every group heading keeps a fixed height:
 * ROW_H must match the row's `h-8` and LABEL_H the heading's `h-9`.
 */
const ROW_H = 32;
const LABEL_H = 36;

/** Rows appear ~22ms apart — enough to read as a cascade, over in under 0.3s. */
const STAGGER_MS = 22;

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function NavRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // One pass lays out the rows and finds the active one's offset.
  let offset = 0;
  let row = 0;
  let activeTop: number | null = null;

  const groups = GROUPS.map((group) => {
    const labelRow = row++;
    offset += LABEL_H;

    const items = group.items.map((item) => {
      const top = offset;
      const active = isActive(pathname, item.to);
      if (active) activeTop = top;
      offset += ROW_H;
      return { ...item, top, active, row: row++ };
    });

    return { label: group.label, labelRow, items };
  });

  return (
    <nav
      aria-label="Primary"
      className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      <Link
        to="/"
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3 transition-colors duration-150 hover:bg-sidebar-accent/40 active:translate-y-px"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <svg viewBox="0 0 32 32" className="size-4" aria-hidden>
            <path
              d="M4 19.5h5l3-9 5.5 13 3-8H28"
              stroke="var(--primary)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block font-heading text-[15px] font-semibold tracking-tight">
            obs·lab
          </span>
          <span className="block text-[11px] text-muted-foreground">control plane</span>
        </span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="relative">
          {activeTop !== null && (
            <span
              aria-hidden
              style={{ transform: `translateY(${activeTop}px)` }}
              className="absolute inset-x-0 top-0 h-8 rounded-lg bg-sidebar-accent transition-transform duration-[220ms] ease-in-out-strong motion-reduce:transition-none"
            >
              <span className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            </span>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              <div
                className="nav-reveal flex h-9 items-end px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.09em] text-muted-foreground/60 uppercase"
                style={{ animationDelay: `${group.labelRow * STAGGER_MS}ms` }}
              >
                {group.label}
              </div>
              <ul aria-label={group.label}>
                {group.items.map((item) => (
                  <li
                    key={item.to}
                    className="nav-reveal"
                    style={{ animationDelay: `${item.row * STAGGER_MS}ms` }}
                  >
                    <Link
                      to={item.to}
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        "relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px",
                        item.active
                          ? "text-sidebar-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/45 hover:text-foreground",
                      )}
                    >
                      <item.icon
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 transition-colors duration-150",
                          item.active ? "text-primary" : "text-muted-foreground/60",
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
