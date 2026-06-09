import { Link } from "@tanstack/react-router";

const NAV = [
  { to: "/", label: "Overview", code: "00" },
  { to: "/telemetry", label: "Telemetry", code: "01" },
  { to: "/lineage", label: "Lineage", code: "02" },
  { to: "/agents", label: "Agents", code: "03" },
  { to: "/incidents", label: "Incidents", code: "04" },
  { to: "/runbooks", label: "Runbooks", code: "05" },
  { to: "/settings", label: "Settings", code: "06" },
] as const;

export function NavRail() {
  return (
    <nav className="flex w-44 shrink-0 flex-col border-r border-rule-soft bg-elev/40">
      <ul className="flex flex-col py-3">
        {NAV.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="group flex items-baseline gap-2.5 border-l-2 border-transparent px-4 py-2 text-sm text-ink-faint transition-colors hover:text-ink-dim"
              activeProps={{
                className: "border-l-signal! text-signal! bg-signal/5",
              }}
            >
              <span className="font-mono text-[10px] tracking-wider opacity-60">{item.code}</span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] leading-relaxed tracking-[0.1em] text-ink-faint/60 uppercase">
          obs-lab
          <br />
          phase 04 · control plane
        </p>
      </div>
    </nav>
  );
}
