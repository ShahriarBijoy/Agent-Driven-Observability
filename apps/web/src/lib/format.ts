export function fmtNumber(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

export function fmtMs(n: number | null): string {
  if (n === null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`;
}

export function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(2)}%`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
