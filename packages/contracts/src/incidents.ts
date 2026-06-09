import { z } from "zod";

/**
 * Incident reports produced by the incident-reporter agent (Phase 5 writes
 * them to Postgres; Phase 4 reads — gracefully empty until then).
 */

export const IncidentSeveritySchema = z.enum(["sev1", "sev2", "sev3"]);
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;

export const IncidentStatusSchema = z.enum(["open", "investigating", "resolved"]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  tenant: z.string(),
  openedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  /** One-paragraph summary shown in the inbox list. */
  summary: z.string(),
  /** Full postmortem, Markdown, produced by the reporter agent. */
  postmortemMd: z.string().optional(),
  /** Deep links into the telemetry plane. */
  links: z
    .object({
      traceUrl: z.string().optional(),
      logsUrl: z.string().optional(),
      dashboardUrl: z.string().optional(),
    })
    .default({}),
});
export type Incident = z.infer<typeof IncidentSchema>;

export const IncidentSummarySchema = IncidentSchema.omit({ postmortemMd: true });
export type IncidentSummary = z.infer<typeof IncidentSummarySchema>;
