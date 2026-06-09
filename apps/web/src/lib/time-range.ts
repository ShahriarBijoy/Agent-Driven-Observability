import { createLocalStore } from "./store";

/** Time window applied to embedded dashboards via Grafana URL params. */
export const TIME_RANGES = ["15m", "1h", "6h", "24h"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const timeRangeStore = createLocalStore<TimeRange>("obs-lab.range", "1h", TIME_RANGES);

export function grafanaRangeParams(range: TimeRange): string {
  return `from=now-${range}&to=now`;
}
