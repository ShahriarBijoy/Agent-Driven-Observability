import type { RunStatus } from "@obs/contracts";
import { Badge } from "@obs/ui";

const TONES: Record<RunStatus, "neutral" | "signal" | "good" | "warn" | "data"> = {
  queued: "neutral",
  running: "signal",
  awaiting_approval: "warn",
  completed: "good",
  failed: "warn",
  denied: "neutral",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge tone={TONES[status]}>{status.replace("_", " ")}</Badge>;
}
