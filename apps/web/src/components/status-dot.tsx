import { cn } from "~/lib/utils";

const TONES = {
  good: "bg-success",
  bad: "bg-destructive",
  warn: "bg-warning",
  live: "bg-primary animate-pulse",
  idle: "bg-muted-foreground/50",
} as const;

export type StatusTone = keyof typeof TONES;

/** Tiny semantic state indicator — reserved for live/health status only. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", TONES[tone], className)}
    />
  );
}
