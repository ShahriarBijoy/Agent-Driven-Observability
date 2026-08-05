import { ThemeToggle } from "~/components/theme-toggle";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { TENANTS, tenantStore, type TenantId } from "~/lib/tenant";
import { TIME_RANGES, timeRangeStore, type TimeRange } from "~/lib/time-range";

export function TopBar() {
  const tenant = tenantStore.use();
  const range = timeRangeStore.use();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Window
          <Select value={range} onValueChange={(v) => timeRangeStore.set(v as TimeRange)}>
            <SelectTrigger size="sm" aria-label="Time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Tenant
          <Select value={tenant} onValueChange={(v) => tenantStore.set(v as TenantId)}>
            <SelectTrigger size="sm" aria-label="Tenant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TENANTS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <Separator orientation="vertical" className="h-5!" />

        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Local dev
        </Badge>

        <ThemeToggle />
      </div>
    </header>
  );
}
