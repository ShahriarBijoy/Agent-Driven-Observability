# Inline agent transcript with AI Elements

Date: 2026-07-11 · Status: approved

## Problem

The agent run detail page (`apps/web/src/routes/agents/runs/$runId.tsx`) and the
live chat page (`apps/web/src/routes/agents/index.tsx`) show tool calls and
artifacts in side panels, detached from the conversation. The assistant's
narration ("Let me discover the actual names...") is one concatenated blob glued
to the final report. We want the AI Elements look
(https://elements.ai-sdk.dev): tool calls, narration, and artifacts inline in
the message flow, with the report rendered as a downloadable artifact card.

Decisions made with the user:

- **Backend change approved** — split assistant narration into timestamped
  segments so text and tool calls interleave genuinely.
- **Scope: both pages** — run detail and live chat share one component set.
- **Flat inline layout** — narration and collapsible tool rows always visible in
  the flow (no collapsed chain-of-thought); the report is an Artifact card.

## 1. Backend — split assistant narration

`apps/agent-service/src/agent_service/agents/base.py`: when a `ToolUseBlock`
arrives and text has accumulated, flush it via `ctx.add_assistant_message(...)`
before starting the tool call; keep the final flush at the end. Each segment
gets a real `createdAt` that sorts before the tool call it precedes.

- Track `emitted_any` separately: the `is_error and not text_parts` fallback at
  `ResultMessage` must not re-fire after mid-run flushes clear the buffer.
- Return value stays the full concatenated text (`incident.py` consumes it).
- No contract change: `AgentRunSchema.messages` already allows multiple
  assistant messages. Old runs render as one blob after their tools.

## 2. Shared feed model — `apps/web/src/lib/run-feed.ts`

Pure `buildRunFeed(run)` merges `messages`, `toolCalls`, and `approvals` into
one list of typed parts (`text | tool | approval`), stable-sorted by ISO
timestamp with original array order as tiebreak (text before tool on equal
timestamps, matching flush-before-start ordering). Artifacts (no timestamp)
always append at the end. Unit-tested with vitest.

## 3. AI Elements components (shadcn registry)

`bunx shadcn@latest add @ai-elements/tool @ai-elements/artifact
@ai-elements/code-block -c apps/web` → `src/components/ai-elements/`. If the
`@ai-elements` namespace doesn't resolve, add
`"@ai-elements": "https://registry.ai-sdk.dev/{name}.json"` to
`components.json` registries.

- **Tool** — inline collapsible tool calls; map `pending/ok/error` onto its
  state badges; show duration.
- **Artifact** — report card with Copy and Download actions (Blob +
  `a[download]`, filename from `artifact.name`, mime from `mediaType`).
  Markdown content renders through the existing `Markdown` + `typeset-docs`;
  JSON through CodeBlock.
- **CodeBlock** — tool args/results JSON with copy button.

Not taken: `Response`/streamdown, `Conversation`/use-stick-to-bottom — our
`Markdown` and `MessageScroller` already cover those and keep the theme.
Installed files get patched to Base UI conventions (`render` prop, not
`asChild`) and local `~/components/ui/*` imports, same as the base-nova
redesign.

## 4. Run detail page

Side cards (Tool calls / Artifacts / Approvals) removed. Single reading column
(~max-w-3xl): header → pending-approval banner (unchanged, keeps Approve/Deny)
→ inline feed (operator bubble right-aligned, narration as ghost markdown, Tool
rows inline, approval history as compact inline markers) → Artifact cards.
Polling logic untouched.

## 5. Live chat page

"Tool calls" side card removed ("Recent runs" stays). The `send()` loop builds
interleaved parts live: `token` appends to the current text part; `tool_call`
closes the text part and inserts/updates a tool part by id (pending → ok in
place). Rendered with the same shared part component inside MessageScroller.

## 6. Testing & verification

- vitest: `buildRunFeed` interleave order, tie-breaks, old blob-style runs,
  pending tools.
- Manual: `obs up` + `obs agents` + `obs web`; fire an RCA run → live inline
  tools; reload run page → persisted interleaving; download artifact; approval
  gate on a mutating agent.
