import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  BookOpenIcon,
  BotIcon,
  GaugeIcon,
  RadioTowerIcon,
  SettingsIcon,
  SirenIcon,
  WaypointsIcon,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: GaugeIcon },
  { to: "/telemetry", label: "Telemetry", icon: ActivityIcon },
  { to: "/lineage", label: "Lineage", icon: WaypointsIcon },
  { to: "/agents", label: "Agents", icon: BotIcon },
  { to: "/incidents", label: "Incidents", icon: SirenIcon },
  { to: "/oncall", label: "On-call", icon: RadioTowerIcon },
  { to: "/runbooks", label: "Runbooks", icon: BookOpenIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function NavRail() {
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <ul className="flex flex-col gap-0.5 p-3">
        {NAV.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-4 [&_svg]:shrink-0"
              activeProps={{
                className: "bg-sidebar-accent! text-sidebar-foreground! [&_svg]:text-primary",
              }}
            >
              <item.icon aria-hidden />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
