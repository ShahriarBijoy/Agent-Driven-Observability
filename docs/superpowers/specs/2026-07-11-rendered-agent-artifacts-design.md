# Rendered agent artifacts — HTML split pane + Mermaid diagrams

Date: 2026-07-11 · Status: approved

## Problem

Agents can only save `text/markdown` / `application/json` artifacts, rendered as
inline cards at the bottom of the run feed. An RCA or incident report is prose
even when the finding is inherently visual (a latency curve with a deploy
marker, a dependency graph with the failing edge). We want the Claude.ai
artifact experience: the agent authors an HTML page with inline SVG charts,
a chip appears in the transcript, and clicking it opens a rendered split pane
beside the chat. Cheap diagrams should also work inline via Mermaid in
markdown.

Decisions made with the user:

- **Hybrid approach** — Mermaid fences in markdown for quick inline diagrams
  AND a `text/html` artifact kind rendered in a sandboxed split pane.
- **Split pane UX** — Claude.ai behavior: chat column slides left, panel takes
  ~55% on the right, stays open while streaming; full-screen overlay below `lg`.
- **Auto-open** — when an HTML artifact arrives mid-stream, the panel opens
  automatically.

## 1. Contracts — `packages/contracts/src/agents.ts` (+ Python mirror)

- `ArtifactSchema.mediaType` gains `"text/html"`.
- `ArtifactSchema` gains `createdAt` (ISO datetime) so artifacts interleave
  chronologically in the feed instead of appending at the end.
- `AgentStreamEventSchema` gains `{ type: "artifact", artifact: ArtifactSchema }`.
  Today artifacts never appear during live chat (no event exists); this fixes
  that gap for all media types.

`agent_service/models.py` mirrors all three (`MediaType`, `Artifact.created_at`,
`ev_artifact`).

## 2. Agent-service

- `db.py`: `agent_artifacts` already has `created_at timestamptz NOT NULL
  DEFAULT now()` — no migration needed; `get_run` starts reading it back into
  the model (it is dropped on read today).
- `context.py` `add_artifact`: stamp `created_at` and `hub.publish(...,
  ev_artifact(artifact))` — the missing half of the persist+publish pattern
  every other method already follows.
- `tools/sdk.py` `save_artifact`: `kind` enum gains `"html"` → `text/html`,
  default name `artifact.html`. Name sanitising (`safe_artifact_name`) and the
  ARTIFACTS_DIR file copy are unchanged.
- Prompts (`PROMPTS` in sdk.py), RCA + incident-reporter: when a visual would
  explain the finding better than prose, save an HTML artifact — one
  self-contained file, inline CSS and SVG only, no external URLs (the viewer
  blocks all network), dark-themed to match the UI, charts drawn from real
  tool-result numbers, kept focused (not a token dump). Quick diagrams may use
  ```` ```mermaid ```` fences in any markdown output instead.

## 3. Web — split-pane artifact viewer

New `apps/web/src/components/artifact-panel.tsx` built from the existing AI
Elements artifact primitives:

- Header: name + media-type badge, Preview/Code tabs, Copy, Download, Close.
- Preview: `text/html` → sandboxed iframe; `text/markdown` → `Markdown` +
  `typeset-docs`; `application/json` → `CodeBlock`. Code tab always shows the
  raw source in a `CodeBlock`.
- **Sandbox:** `<iframe sandbox="allow-scripts" srcdoc={wrapped}>` — never
  `allow-same-origin` (unique opaque origin: no cookies, no storage, no parent
  DOM). The srcdoc is wrapped with an injected
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none';
  style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;
  font-src data:">` so artifact pages cannot make network requests. This is the
  containment for prompt-injected telemetry (a hostile log line steering the
  agent's HTML): scripts may run, but they can't reach anything. Residual
  channels: the frame can still navigate itself (location/meta-refresh) to
  exfiltrate its own content, and parent.postMessage works — bounded by the
  opaque origin (no cookies/storage/DOM), and the app must never trust window
  "message" events from artifact frames.

Layout on both `/agents` and `/agents/runs/$runId`: a `selectedArtifact` state;
when set, the page becomes a two-column flex/grid (feed ~45% / panel ~55%) and
the feed's centered `max-w-3xl` relaxes; closing restores the single column.
Below `lg`, the panel renders as a fixed full-screen overlay instead.

In the feed, HTML artifacts render as a compact chip (file icon, name, "open");
markdown/JSON artifacts keep their inline cards and gain an "open in panel"
action. When a `text/html` artifact event arrives mid-stream, the panel
auto-opens on it.

## 4. Feed interleaving + live stream

- `run-feed.ts`: `RunFeedPart` gains `{ kind: "artifact"; artifact }`;
  `buildRunFeed` merges `run.artifacts` by `createdAt`. `KIND_RANK` puts
  artifact after tool and approval (a tool produces it), i.e. message < tool <
  approval < artifact. Old artifacts without `createdAt` cannot occur after the
  DB backfill; the zod field is required.
- `agents/index.tsx`: `artifact` event case appends an artifact part (mirrors
  `upsertToolCall`) and auto-opens the panel for `text/html`.
- `sse.ts` validates against the contract union, so it picks the new event up
  from the schema change.

## 5. Mermaid in Markdown

`markdown.tsx` renders ```` ```mermaid ```` fences through the `mermaid`
library: a `code` component override detects the language, lazy-loads mermaid
via dynamic import on first use (keeps it out of the main bundle), initializes
with the theme from the existing light/dark store, and re-renders on theme
change. A diagram that fails to parse falls back to the plain code block. This
gives every markdown surface (chat narration, postmortems, runbooks) diagram
ability for a few hundred tokens.

## 6. Testing & verification

- vitest: `buildRunFeed` interleaves artifact parts by timestamp; kind
  tie-break order; artifact chip vs card selection by media type.
- pytest: `save_artifact` `kind='html'` maps to `text/html` and a sane default
  name; `add_artifact` publishes an `artifact` event on the hub.
- Manual (`obs up` + `obs agents` + `obs web`): ask RCA to "draw the latency
  spike for tenant beta" → chip streams in, panel auto-opens with an SVG chart;
  devtools network tab shows zero requests from the iframe; incident-reporter
  postmortem renders a mermaid diagram inline; reload the persisted run → same
  transcript, artifact interleaved in place; Copy/Download unchanged.
