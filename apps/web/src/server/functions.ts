import { AgentSettingsUpdateSchema, ApprovalDecisionRequestSchema } from "@obs/contracts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as agentClient from "./agent-client";
import {
  incidentById,
  oncallFeed,
  oncallIncidentDetail,
  recentIncidents,
  recentAgentRunsFromDb,
} from "./db";
import { serverEnv } from "./env";
import { fetchGoldenSignals } from "./mimir";
import { listRunbooks } from "./runbooks";
import { SAMPLE_INCIDENT } from "./sample-incident";

/** Everything the home page needs, fetched in parallel on the server. */
export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  // Runs come from the DB directly: agent-service is the same source of truth,
  // one fewer hop, and the overview still renders if the service is down.
  const [signals, incidents, runs] = await Promise.all([
    fetchGoldenSignals(),
    recentIncidents(10),
    recentAgentRunsFromDb(10),
  ]);
  return { signals, incidents, runs };
});

export const getAgentRuns = createServerFn({ method: "GET" }).handler(async () => {
  return agentClient.listAgentRuns();
});

export const getAgentRun = createServerFn({ method: "GET" })
  .inputValidator(z.object({ runId: z.string() }))
  .handler(async ({ data }) => {
    return agentClient.getAgentRun(data.runId);
  });

export const decideApproval = createServerFn({ method: "POST" })
  .inputValidator(ApprovalDecisionRequestSchema)
  .handler(async ({ data }) => {
    return agentClient.submitApprovalDecision(data);
  });

/**
 * Inbox list plus (optionally) one selected incident with its postmortem.
 * Falls back to a labeled sample while the incidents table is empty so the
 * rendering path is demonstrable before Phase 5.
 */
export const getIncidentInbox = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().optional() }))
  .handler(async ({ data }) => {
    const fromDb = await recentIncidents(50);
    const incidents = fromDb.length > 0 ? fromDb : [SAMPLE_INCIDENT];
    let selected = null;
    if (data.id !== undefined) {
      selected = data.id === SAMPLE_INCIDENT.id ? SAMPLE_INCIDENT : await incidentById(data.id);
    }
    return { incidents, selected };
  });

/** Phase 11: the on-call feed — newest-first incidents with alert-storm size
 * and linked runs. Powers the /oncall left pane and its 2.5s poll. */
export const getOncallFeed = createServerFn({ method: "GET" }).handler(async () => {
  return oncallFeed(50);
});

/** One incident's on-call detail: machine timeline, pre-check leads,
 * runbook-match, and any pending approval. Null when the id is unknown. */
export const getOncallIncident = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    return oncallIncidentDetail(data.id);
  });

export const getRunbooks = createServerFn({ method: "GET" }).handler(async () => {
  return listRunbooks();
});

/** Launch the runbook executor on a runbook file (POST /runbooks/:name/execute).
 * runId is null when agent-service (:8093) is down or rejected the request. */
export const runRunbookExecutor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1), tenant: z.string().min(1) }))
  .handler(async ({ data }) => {
    return { runId: await agentClient.executeRunbook(data.name, data.tenant) };
  });

/**
 * Hand an incident to the auto-fixer (POST /auto-fix). The postmortem excerpt
 * is attached server-side so the client only sends the incident id plus any
 * operator guidance; runId is null when the incident is unknown (e.g. the
 * sample) or agent-service is down.
 */
export const autoFixIncident = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ incidentId: z.string().min(1), instructions: z.string().max(4000).optional() }),
  )
  .handler(async ({ data }) => {
    const incident = await incidentById(data.incidentId);
    if (incident === null) return { runId: null };
    const errorPattern =
      `Incident ${incident.id} (${incident.severity}, tenant ${incident.tenant}): ` +
      `${incident.title}\n${incident.summary}`;
    const parts: string[] = [];
    const guidance = data.instructions?.trim();
    if (guidance !== undefined && guidance !== "") parts.push(`Operator guidance: ${guidance}`);
    if (incident.postmortemMd !== undefined) {
      parts.push(`Postmortem (excerpt):\n${incident.postmortemMd.slice(0, 3500)}`);
    }
    const runId = await agentClient.startAutoFix({
      tenant: incident.tenant,
      errorPattern,
      hint: parts.join("\n\n"),
    });
    return { runId };
  });

/**
 * Everything /settings needs: dev auth (local lab only, the token is not a
 * secret) plus the live agent runtime settings. agentSettings is null when
 * agent-service (:8093) is down — the page renders a start hint instead.
 */
export const getSettingsPage = createServerFn({ method: "GET" }).handler(async () => {
  const agentSettings = await agentClient.getAgentSettings();
  return { devTenant: serverEnv.devTenant, devToken: serverEnv.devToken, agentSettings };
});

export const saveAgentSettings = createServerFn({ method: "POST" })
  .inputValidator(AgentSettingsUpdateSchema)
  .handler(async ({ data }) => {
    return agentClient.updateAgentSettings(data);
  });
