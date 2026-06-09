import { AgentStreamEventSchema, type AgentStreamEvent } from "@obs/contracts";

/**
 * Parse a `text/event-stream` body into validated agent events. The BFF is
 * the only producer, but events are still schema-checked — the contract is
 * the boundary, not trust.
 */
export async function* readAgentStream(res: Response): AsyncGenerator<AgentStreamEvent> {
  if (!res.ok || res.body === null) {
    yield { type: "error", message: `stream failed: HTTP ${res.status}` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (data === "") continue;
      const parsed = AgentStreamEventSchema.safeParse(JSON.parse(data));
      if (parsed.success) yield parsed.data;
      else yield { type: "error", message: `malformed event: ${parsed.error.message}` };
    }
  }
}
