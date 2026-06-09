import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("h-px w-full bg-rule-soft", className)} {...props} />;
}
