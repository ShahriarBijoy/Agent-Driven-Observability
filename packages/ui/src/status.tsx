import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type StatusTone = "good" | "warn" | "bad" | "idle" | "live";

const toneClasses: Record<StatusTone, string> = {
  good: "bg-good",
  warn: "bg-signal",
  bad: "bg-warn",
  idle: "bg-ink-faint",
  live: "bg-signal animate-pulse",
};

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
}

export function StatusDot({ tone, className, ...props }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 rounded-full", toneClasses[tone], className)}
      {...props}
    />
  );
}
