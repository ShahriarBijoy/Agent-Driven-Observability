import { AgentChatRequestSchema, type AgentStreamEvent } from "@obs/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { startEchoTurn } from "~/server/runs-store";

/**
 * POST /api/agents/chat — the BFF's streaming agent endpoint.
 *
 * Today it runs the in-process echo agent; in Phase 5 the handler body
 * becomes a proxy to agent-service's SSE stream. The wire format (SSE frames
 * of AgentStreamEvent JSON) is the contract and does not change.
 */

function sseFrame(event: AgentStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

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

        const { events } = startEchoTurn(parsed.data);

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const event of events) {
                controller.enqueue(sseFrame(event));
              }
            } catch (err) {
              controller.enqueue(
                sseFrame({
                  type: "error",
                  message: err instanceof Error ? err.message : "stream failed",
                }),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
