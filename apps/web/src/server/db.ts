import type {
  AgentRunSummary,
  Incident,
  IncidentSeverity,
  IncidentSummary,
  RunStatus,
} from "@obs/contracts";
import postgres from "postgres";
import { serverEnv } from "./env";

/**
 * Read-only Postgres access for the home page and incident inbox. The tables
 * (`incidents`, `agent_runs`) are created by Phase 5's agent-service
 * migrations; until they exist — or when Postgres is down — every query
 * degrades to an empty list instead of an error page.
 */

declare global {
  var __obsSql: ReturnType<typeof postgres> | undefined;
}

function sql() {
  globalThis.__obsSql ??= postgres(serverEnv.databaseUrl, {
    max: 4,
    connect_timeout: 2,
    idle_timeout: 30,
  });
  return globalThis.__obsSql;
}

async function safeRows<T>(query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch {
    // 42P01 (missing table) before Phase 5, or connection refused — both fine.
    return [];
  }
}

export async function recentIncidents(limit = 10): Promise<IncidentSummary[]> {
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select id, title, severity, status, tenant, opened_at, resolved_at, summary
      from incidents
      order by opened_at desc
      limit ${limit}
    `,
  );
  return rows.map((r) => ({
    id: String(r["id"]),
    title: String(r["title"]),
    severity: r["severity"] as IncidentSummary["severity"],
    status: r["status"] as IncidentSummary["status"],
    tenant: String(r["tenant"]),
    openedAt: new Date(r["opened_at"] as string).toISOString(),
    resolvedAt: r["resolved_at"] ? new Date(r["resolved_at"] as string).toISOString() : undefined,
    summary: String(r["summary"] ?? ""),
    links: {},
  }));
}

export async function incidentById(id: string): Promise<Incident | null> {
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select id, title, severity, status, tenant, opened_at, resolved_at, summary, postmortem_md
      from incidents
      where id = ${id}
      limit 1
    `,
  );
  const r = rows[0];
  if (r === undefined) return null;
  return {
    id: String(r["id"]),
    title: String(r["title"]),
    severity: r["severity"] as Incident["severity"],
    status: r["status"] as Incident["status"],
    tenant: String(r["tenant"]),
    openedAt: new Date(r["opened_at"] as string).toISOString(),
    resolvedAt: r["resolved_at"] ? new Date(r["resolved_at"] as string).toISOString() : undefined,
    summary: String(r["summary"] ?? ""),
    postmortemMd: r["postmortem_md"] ? String(r["postmortem_md"]) : undefined,
    links: {},
  };
}

/** Agent runs recorded by Phase 5; empty until then (the BFF's in-memory echo runs are separate). */
export async function recentAgentRunsFromDb(limit = 10): Promise<AgentRunSummary[]> {
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select id, agent, tenant, status, title, created_at, updated_at
      from agent_runs
      order by created_at desc
      limit ${limit}
    `,
  );
  return rows.map((r) => ({
    id: String(r["id"]),
    agent: r["agent"] as AgentRunSummary["agent"],
    tenant: String(r["tenant"]),
    status: r["status"] as AgentRunSummary["status"],
    title: String(r["title"]),
    createdAt: new Date(r["created_at"] as string).toISOString(),
    updatedAt: new Date(r["updated_at"] as string).toISOString(),
  }));
}

export interface PendingApprovalNotice {
  runId: string;
  approvalId: string;
  summary: string;
  requestedAt: string;
  runTitle: string;
  agent: string;
}

/**
 * Undecided approval gates on runs still waiting for one — powers the global
 * approval toasts. Scoped to `status = 'awaiting_approval'` for the same
 * reason as oncallIncidentDetail: a decision-less approval row on a settled
 * run is stale bookkeeping, not something an operator can still act on.
 */
export async function pendingApprovalsFromDb(): Promise<PendingApprovalNotice[]> {
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select ap.id as approval_id, ap.run_id, ap.summary, ap.requested_at, r.title, r.agent
      from agent_approvals ap
      join agent_runs r on r.id = ap.run_id
      where ap.decision is null and r.status = 'awaiting_approval'
      order by ap.requested_at desc
      limit 10
    `,
  );
  return rows.map((r) => ({
    runId: String(r["run_id"]),
    approvalId: String(r["approval_id"]),
    summary: String(r["summary"]),
    requestedAt: new Date(r["requested_at"] as string).toISOString(),
    runTitle: String(r["title"]),
    agent: String(r["agent"]),
  }));
}

/**
 * Phase 11: the on-call brain's feed. incidents now carry an alert_key
 * (dedup), a verify_deadline/verified_at pair (did recovery actually stick),
 * escalations (re-escalation count), and postmortem_pr_url — plus the
 * incident_alerts / incident_runs / incident_timeline tables the watcher and
 * the oncall agent write to as they work a page. Everything below degrades to
 * []/null the same way recentIncidents does.
 */

export interface OncallRunRef {
  runId: string;
  kind: string;
  status: RunStatus;
}

export interface OncallIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: "open" | "resolved";
  openedAt: string;
  resolvedAt?: string;
  verifiedAt?: string;
  verifyDeadline?: string;
  escalations: number;
  alertCount: number;
  lastAlertAt?: string;
  postmortemPrUrl?: string;
  runs: OncallRunRef[];
}

export interface OncallTimelineEntry {
  ts: string;
  source: string;
  label: string;
}

export interface OncallPendingApproval {
  runId: string;
  approvalId: string;
  summary: string;
}

export interface OncallIncidentDetail extends OncallIncident {
  timeline: OncallTimelineEntry[];
  prechecksMd: string | null;
  runbookMatchMd: string | null;
  pendingApproval: OncallPendingApproval | null;
}

/** incident_runs joined to agent_runs.status, grouped by incident_id. One
 * query for however many incident ids the caller needs (the feed) or a
 * single id (the detail page). */
async function oncallRunsFor(ids: string[]): Promise<Map<string, OncallRunRef[]>> {
  const byIncident = new Map<string, OncallRunRef[]>();
  if (ids.length === 0) return byIncident;
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select ir.incident_id, ir.run_id, ir.kind, r.status
      from incident_runs ir
      join agent_runs r on r.id = ir.run_id
      where ir.incident_id = any(${ids})
      order by ir.created_at asc
    `,
  );
  for (const r of rows) {
    const incidentId = String(r["incident_id"]);
    const list = byIncident.get(incidentId) ?? [];
    list.push({
      runId: String(r["run_id"]),
      kind: String(r["kind"]),
      status: r["status"] as RunStatus,
    });
    byIncident.set(incidentId, list);
  }
  return byIncident;
}

function toOncallIncident(r: Record<string, unknown>, runs: OncallRunRef[]): OncallIncident {
  return {
    id: String(r["id"]),
    title: String(r["title"]),
    severity: r["severity"] as IncidentSeverity,
    status: r["status"] as OncallIncident["status"],
    openedAt: new Date(r["opened_at"] as string).toISOString(),
    resolvedAt: r["resolved_at"] ? new Date(r["resolved_at"] as string).toISOString() : undefined,
    verifiedAt: r["verified_at"] ? new Date(r["verified_at"] as string).toISOString() : undefined,
    verifyDeadline: r["verify_deadline"]
      ? new Date(r["verify_deadline"] as string).toISOString()
      : undefined,
    escalations: Number(r["escalations"] ?? 0),
    alertCount: Number(r["alert_count"] ?? 0),
    lastAlertAt: r["last_alert_at"]
      ? new Date(r["last_alert_at"] as string).toISOString()
      : undefined,
    postmortemPrUrl: r["postmortem_pr_url"] ? String(r["postmortem_pr_url"]) : undefined,
    runs,
  };
}

/** Newest-first incidents with their alert-storm size and linked runs — the
 * left-pane feed. Awaiting-approval is derived client-side from
 * `runs.some(r => r.status === "awaiting_approval")`, not stored separately.
 * `alert_key is not null` scopes this feed to on-call-brain incidents only —
 * legacy incidents (created before Phase 11, or by a path that never set an
 * alert_key) have nowhere in the feed's incident_alerts/incident_runs/
 * incident_timeline machinery to hang data off, and stay visible on
 * /incidents instead. */
export async function oncallFeed(limit = 50): Promise<OncallIncident[]> {
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select i.id, i.title, i.severity, i.status, i.opened_at, i.resolved_at, i.verified_at,
             i.verify_deadline, i.escalations, i.postmortem_pr_url,
             count(a.id) as alert_count, max(a.ts) as last_alert_at
      from incidents i
      left join incident_alerts a on a.incident_id = i.id
      where i.alert_key is not null
      group by i.id
      order by i.opened_at desc
      limit ${limit}
    `,
  );
  const runsByIncident = await oncallRunsFor(rows.map((r) => String(r["id"])));
  return rows.map((r) => toOncallIncident(r, runsByIncident.get(String(r["id"])) ?? []));
}

/** One incident's full detail: the machine timeline, the latest linked run's
 * prechecks.md / runbook-match.md artifacts, and any pending approval (found
 * via agent_approvals.decision IS NULL joined through incident_runs, scoped
 * to a run that's still awaiting_approval or running — a decision-less
 * approval row on a completed/failed/denied run is stale bookkeeping, not
 * something an operator can still act on). */
export async function oncallIncidentDetail(id: string): Promise<OncallIncidentDetail | null> {
  const rows = await safeRows<Record<string, unknown>>(
    () => sql()`
      select i.id, i.title, i.severity, i.status, i.opened_at, i.resolved_at, i.verified_at,
             i.verify_deadline, i.escalations, i.postmortem_pr_url,
             count(a.id) as alert_count, max(a.ts) as last_alert_at
      from incidents i
      left join incident_alerts a on a.incident_id = i.id
      where i.id = ${id}
      group by i.id
    `,
  );
  const row = rows[0];
  if (row === undefined) return null;

  const [runsByIncident, timelineRows, prechecksRows, runbookRows, approvalRows] =
    await Promise.all([
      oncallRunsFor([id]),
      safeRows<Record<string, unknown>>(
        () => sql()`
          select ts, source, label from incident_timeline
          where incident_id = ${id}
          order by ts asc
        `,
      ),
      safeRows<Record<string, unknown>>(
        () => sql()`
          select aa.content
          from agent_artifacts aa
          join incident_runs ir on ir.run_id = aa.run_id
          where ir.incident_id = ${id} and aa.name = 'prechecks.md'
          order by aa.created_at desc
          limit 1
        `,
      ),
      safeRows<Record<string, unknown>>(
        () => sql()`
          select aa.content
          from agent_artifacts aa
          join incident_runs ir on ir.run_id = aa.run_id
          where ir.incident_id = ${id} and aa.name = 'runbook-match.md'
          order by aa.created_at desc
          limit 1
        `,
      ),
      safeRows<Record<string, unknown>>(
        () => sql()`
          select ap.id as approval_id, ap.run_id, ap.summary
          from agent_approvals ap
          join incident_runs ir on ir.run_id = ap.run_id
          join agent_runs r on r.id = ap.run_id
          where ir.incident_id = ${id} and ap.decision is null
            and r.status in ('awaiting_approval', 'running')
          order by ap.requested_at desc
          limit 1
        `,
      ),
    ]);

  const approvalRow = approvalRows[0];

  return {
    ...toOncallIncident(row, runsByIncident.get(id) ?? []),
    timeline: timelineRows.map((t) => ({
      ts: new Date(t["ts"] as string).toISOString(),
      source: String(t["source"]),
      label: String(t["label"]),
    })),
    prechecksMd: prechecksRows[0] ? String(prechecksRows[0]["content"]) : null,
    runbookMatchMd: runbookRows[0] ? String(runbookRows[0]["content"]) : null,
    pendingApproval:
      approvalRow !== undefined
        ? {
            runId: String(approvalRow["run_id"]),
            approvalId: String(approvalRow["approval_id"]),
            summary: String(approvalRow["summary"]),
          }
        : null,
  };
}
