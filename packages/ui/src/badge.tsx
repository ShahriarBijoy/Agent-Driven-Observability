import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-xs border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.1em]",
  {
    variants: {
      tone: {
        neutral: "border-rule text-ink-faint",
        signal: "border-signal-dim/50 text-signal",
        good: "border-good/40 text-good",
        warn: "border-warn/40 text-warn",
        data: "border-data/40 text-data",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
