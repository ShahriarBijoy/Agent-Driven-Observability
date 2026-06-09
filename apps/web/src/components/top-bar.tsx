import { Badge, Select, StatusDot } from "@obs/ui";
import { TENANTS, tenantStore, type TenantId } from "~/lib/tenant";
import { TIME_RANGES, timeRangeStore, type TimeRange } from "~/lib/time-range";

export function TopBar() {
  const tenant = tenantStore.use();
  const range = timeRangeStore.use();

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-rule bg-elev/60 px-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg leading-none font-semibold tracking-tight text-ink">
          obs<span className="text-signal">·</span>lab
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase">
          control plane
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <label className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-ink-faint uppercase">
          window
          <Select
            value={range}
            onChange={(e) => timeRangeStore.set(e.currentTarget.value as TimeRange)}
          >
            {TIME_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-ink-faint uppercase">
          tenant
          <Select
            value={tenant}
            onChange={(e) => tenantStore.set(e.currentTarget.value as TenantId)}
          >
            {TENANTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </label>

        <Badge tone="signal">
          <StatusDot tone="live" />
          local
        </Badge>
        <Badge tone="neutral">dev mode</Badge>
      </div>
    </header>
  );
}
