import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

/** Styled native select — no popover dependency; fits the austere panel. */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-7 cursor-pointer appearance-none rounded-sm border border-rule bg-elev py-0 pr-7 pl-2 font-mono text-xs text-ink-dim hover:border-signal-dim focus-visible:outline-1 focus-visible:outline-signal-dim",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%228%22%20height%3D%225%22%3E%3Cpath%20fill%3D%22%237a7163%22%20d%3D%22M0%200l4%205%204-5z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:8px_5px] bg-[position:right_10px_center] bg-no-repeat",
        className,
      )}
      {...props}
    />
  );
}
