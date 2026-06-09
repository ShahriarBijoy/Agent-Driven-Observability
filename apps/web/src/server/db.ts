import type { AgentRunSummary, IncidentSummary, Incident } from "@obs/contracts";
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
