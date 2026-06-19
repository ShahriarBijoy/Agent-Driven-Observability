import { AgentChatRequestSchema, type AgentStreamEvent } from "@obs/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "~/server/env";

/**
 * POST /api/agents/chat — the BFF's streaming agent endpoint.
 *
 * Phase 5: a thin proxy to agent-service's `POST /chat` SSE stream. The wire
 * format (SSE frames of AgentStreamEvent JSON) is the contract and does not
 * change, so the browser code is untouched. If agent-service is unreachable we
 * emit a single SSE `error` frame instead of a 500, keeping the chat UI sane.
 */

function sseError(message: string): string {
  return `data: ${JSON.stringify({ type: "error", message } satisfies AgentStreamEvent)}\n\n`;
}

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;

export const Route = createFileRoute("/api/agents/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = AgentChatRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json(
            { error: { code: "bad_request", message: parsed.error.message } },
            { status: 400 },
          );
        }

        let upstream: Response;
        try {
          upstream = await fetch(new URL("/chat", serverEnv.agentServiceUrl), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(parsed.data),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "agent-service unreachable";
          return new Response(sseError(message), { headers: SSE_HEADERS });
        }

        if (!upstream.ok || upstream.body === null) {
          return new Response(sseError(`agent-service responded ${upstream.status}`), {
            headers: SSE_HEADERS,
          });
        }

        // Pipe the upstream SSE straight through to the browser.
        return new Response(upstream.body, { headers: SSE_HEADERS });
      },
    },
  },
});
