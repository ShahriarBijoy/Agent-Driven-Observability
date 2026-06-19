import { ApprovalDecisionRequestSchema } from "@obs/contracts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as agentClient from "./agent-client";
import { incidentById, recentIncidents, recentAgentRunsFromDb } from "./db";
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

export const getRunbooks = createServerFn({ method: "GET" }).handler(async () => {
  return listRunbooks();
});

/** Dev-auth surface for /settings — local lab only, the token is not a secret. */
export const getDevAuth = createServerFn({ method: "GET" }).handler(async () => {
  return { devTenant: serverEnv.devTenant, devToken: serverEnv.devToken };
});
