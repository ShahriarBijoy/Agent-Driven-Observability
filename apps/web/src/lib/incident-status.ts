import type { IncidentStatus, IncidentSeverity } from "@obs/contracts";

/**
 * One severity vocabulary for every surface that shows incidents — the
 * overview, the inbox, and the on-call feed. Before this existed the overview
 * painted sev2 with the sev1 treatment, so the same incident read as two
 * different severities depending on which page you were looking at.
 */
export const SEV_STYLES: Record<IncidentSeverity, string> = {
  sev1: "bg-destructive/10 text-destructive",
  sev2: "bg-warning/15 text-warning",
  sev3: "bg-muted text-muted-foreground",
};

/** Anything nobody has closed yet — the only kind worth interrupting for. */
export function isIncidentLive(status: IncidentStatus): boolean {
  return status !== "resolved";
}

export const INCIDENT_STATUS_STYLES: Record<IncidentStatus, string> = {
  open: "text-warning",
  investigating: "text-warning",
  resolved: "text-muted-foreground",
};
