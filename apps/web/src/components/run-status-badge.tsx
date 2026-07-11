import type { RunStatus } from "@obs/contracts";
import { Badge } from "~/components/ui/badge";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

const STYLES: Record<RunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  awaiting_approval: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success",
  failed: "bg-destructive/10 text-destructive",
  denied: "bg-muted text-muted-foreground",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant="secondary" className={cn("shrink-0", STYLES[status])}>
      {status === "running" ? <Spinner className="size-3" /> : null}
      {status.replace("_", " ")}
    </Badge>
  );
}
