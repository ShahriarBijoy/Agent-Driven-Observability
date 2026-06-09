import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}

/** Quiet placeholder for panels whose upstream doesn't exist yet. */
export function EmptyState({ title, detail, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-rule px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">{title}</p>
      {detail ? (
        <p className="max-w-md text-xs leading-relaxed text-ink-faint/80">{detail}</p>
      ) : null}
      {action}
    </div>
  );
}
