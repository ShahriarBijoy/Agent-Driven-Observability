import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-rule-soft bg-card shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-b border-rule-soft px-4 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

/** Mono, uppercase, faint — section labels read like instrument markings. */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}
