# Rendered Agent Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents can save `text/html` artifacts with inline SVG charts, rendered in a sandboxed split-pane viewer beside the chat (Claude.ai-style), plus Mermaid diagram rendering in all markdown surfaces; artifacts stream live and interleave chronologically in the run feed.

**Architecture:** Extend the shared contract (`@obs/contracts` zod + pydantic mirror) with a `text/html` media type, a required `createdAt` on artifacts, and a new `artifact` SSE event. The agent-service's `add_artifact` gains the missing publish half of its persist+publish pattern. The web app renders HTML artifacts in a CSP-locked sandboxed iframe inside a new `ArtifactPanel` that splits the page 45/55; Mermaid renders lazily inside the existing `Markdown` component.

**Tech Stack:** TypeScript (zod v4, React 19, TanStack Start/Router, Tailwind v4, Base UI shadcn), Python 3.11 (pydantic v2, FastAPI, asyncpg), vitest, pytest, mermaid (new dep), Bun workspaces.

**Spec:** `docs/superpowers/specs/2026-07-11-rendered-agent-artifacts-design.md`

## Global Constraints

- Base branch: `web-ui-shadcn-redesign` (the AI Elements components only exist there).
- The iframe sandbox is `sandbox="allow-scripts"` and MUST NOT include `allow-same-origin`, ever.
- The artifact CSP is exactly: `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:`.
- Python and zod contract shapes must stay byte-compatible: camelCase wire keys, `Z`-suffixed millisecond ISO timestamps.
- No `useEffect` in React code — this repo uses derived state, key-based resets, and `~/lib/use-mount-effect` (see `apps/web/src/lib/use-mount-effect.ts`).
- Web checks: `cd apps/web && bun run typecheck && bun run test`. Python checks: `cd apps/agent-service && uv run pytest tests -v` (fallback if uv is absent: `.venv\Scripts\python.exe -m pytest tests -v`).
- Commit message style follows the repo: `web: …`, `agent-service: …`, `contracts: …`, `docs: …`.
- After Task 1, web pages that parse live agent-service responses require Task 3's service changes — run the full stack only from Task 8 onward.

---

### Task 1: Contract — `text/html`, `createdAt`, `artifact` stream event

**Files:**
- Modify: `packages/contracts/src/agents.ts:52-58` (ArtifactSchema), `:109-117` (AgentStreamEventSchema)
- Modify: `docs/superpowers/specs/2026-07-11-rendered-agent-artifacts-design.md` (§2 correction)

**Interfaces:**
- Produces: `ArtifactSchema` = `{ id, name, mediaType: "text/markdown"|"application/json"|"text/html", content, createdAt: ISO string }`; stream event variant `{ type: "artifact", artifact: Artifact }`. Every later task relies on these exact names.

- [ ] **Step 1: Update ArtifactSchema**

In `packages/contracts/src/agents.ts` replace:

```ts
export const ArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.enum(["text/markdown", "application/json"]),
  content: z.string(),
});
```

with:

```ts
export const ArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.enum(["text/markdown", "application/json", "text/html"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
```

- [ ] **Step 2: Add the artifact stream event**

In the same file, inside `AgentStreamEventSchema`'s discriminated union, add after the `tool_call` line:

```ts
  z.object({ type: z.literal("artifact"), artifact: ArtifactSchema }),
```

- [ ] **Step 3: Correct the spec's §2 first bullet**

The DB column already exists (`db.py` SCHEMA_SQL line 66: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`). In `docs/superpowers/specs/2026-07-11-rendered-agent-artifacts-design.md`, replace the bullet starting `` `db.py`: `agent_artifacts` gains `created_at` `` with:

```markdown
- `db.py`: `agent_artifacts` already has `created_at timestamptz NOT NULL
  DEFAULT now()` — no migration needed; `get_run` starts reading it back into
  the model (it is dropped on read today).
```

- [ ] **Step 4: Typecheck the web app (consumes the contract)**

Run: `cd apps/web && bun run typecheck`
Expected: PASS (nothing in web constructs an `Artifact` literal yet).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/agents.ts docs/superpowers/specs/2026-07-11-rendered-agent-artifacts-design.md
git commit -m "contracts: text/html artifacts, createdAt, artifact stream event"
```

---

### Task 2: Python models mirror (TDD)

**Files:**
- Modify: `apps/agent-service/src/agent_service/models.py:37` (MediaType), `:85-89` (Artifact), `:139+` (event builders)
- Test: `apps/agent-service/tests/test_models.py`

**Interfaces:**
- Consumes: contract shapes from Task 1.
- Produces: `MediaType` includes `"text/html"`; `Artifact` has required `created_at: str`; `ev_artifact(artifact: Artifact) -> dict` returning `{"type": "artifact", "artifact": <wire dict>}`. Tasks 3+ import `ev_artifact`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent-service/tests/test_models.py` (and add `Artifact` and `ev_artifact` to the existing `from agent_service.models import (...)` block):

```python
def test_artifact_wire_has_created_at_and_html_media() -> None:
    art = Artifact(id="a1", name="report.html", media_type="text/html",
                   content="<h1>x</h1>", created_at=now_iso())
    wire = art.wire()
    assert wire["mediaType"] == "text/html"
    assert ISO_RE.match(wire["createdAt"])


def test_ev_artifact_shape() -> None:
    art = Artifact(id="a1", name="report.html", media_type="text/html",
                   content="<h1>x</h1>", created_at=now_iso())
    out = ev_artifact(art)
    assert out["type"] == "artifact"
    assert out["artifact"]["id"] == "a1"
    assert out["artifact"]["createdAt"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent-service && uv run pytest tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'ev_artifact'`.

- [ ] **Step 3: Implement the model changes**

In `apps/agent-service/src/agent_service/models.py`:

Line 37, replace:

```python
MediaType = Literal["text/markdown", "application/json"]
```

with:

```python
MediaType = Literal["text/markdown", "application/json", "text/html"]
```

Replace the `Artifact` class:

```python
class Artifact(_Wire):
    id: str
    name: str
    media_type: MediaType
    content: str
    created_at: str
```

After `ev_tool_call`, add:

```python
def ev_artifact(artifact: Artifact) -> dict[str, Any]:
    return {"type": "artifact", "artifact": artifact.wire()}
```

- [ ] **Step 4: Run the full python suite**

Run: `cd apps/agent-service && uv run pytest tests -v`
Expected: PASS — including pre-existing tests. (`echo.py`/`incident.py` construct artifacts only via `ctx.add_artifact`, which Task 3 updates; nothing else constructs `Artifact` directly, so the new required field breaks no existing test.)

- [ ] **Step 5: Commit**

```bash
git add apps/agent-service/src/agent_service/models.py apps/agent-service/tests/test_models.py
git commit -m "agent-service: mirror text/html + createdAt artifact contract, ev_artifact"
```

---

### Task 3: agent-service — publish artifacts, read `created_at`, html kind, prompts (TDD)

**Files:**
- Modify: `apps/agent-service/src/agent_service/context.py:146-152`
- Modify: `apps/agent-service/src/agent_service/db.py:239-243` (get_run artifact mapping)
- Modify: `apps/agent-service/src/agent_service/tools/sdk.py:215-250` (save_artifact), `:276-294` (prompts)
- Test: `apps/agent-service/tests/test_context.py` (create), `apps/agent-service/tests/test_sdk_tools.py` (create)

**Interfaces:**
- Consumes: `ev_artifact` from Task 2.
- Produces: `ctx.add_artifact(name, media_type, content)` (signature unchanged) now stamps `created_at` and publishes; module-level `ARTIFACT_KINDS: dict[str, tuple[str, str]]` in `tools/sdk.py` mapping kind → `(media_type, default_name)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/agent-service/tests/test_context.py`:

```python
"""add_artifact must do both halves of the persist+publish pattern."""

from __future__ import annotations

from agent_service.context import new_run
from agent_service.hub import hub


async def test_add_artifact_stamps_created_at_and_publishes(monkeypatch) -> None:
    saved: list[tuple[str, object]] = []

    async def fake_add_artifact(run_id: str, artifact: object) -> None:
        saved.append((run_id, artifact))

    monkeypatch.setattr("agent_service.db.add_artifact", fake_add_artifact)

    ctx = new_run("rca", "acme", "test run")
    art = await ctx.add_artifact("report.html", "text/html", "<h1>hi</h1>")
    try:
        assert art.created_at  # stamped at creation
        assert saved and saved[0][0] == ctx.run_id  # persisted
        events = hub.ensure(ctx.run_id).buffer  # published
        assert {"type": "artifact", "artifact": art.wire()} in events
    finally:
        hub.cleanup(ctx.run_id)
```

Create `apps/agent-service/tests/test_sdk_tools.py`:

```python
"""save_artifact kind → (media type, default name) mapping."""

from __future__ import annotations

from agent_service.tools.sdk import ARTIFACT_KINDS


def test_artifact_kinds() -> None:
    assert ARTIFACT_KINDS["markdown"] == ("text/markdown", "artifact.md")
    assert ARTIFACT_KINDS["json"] == ("application/json", "artifact.json")
    assert ARTIFACT_KINDS["html"] == ("text/html", "artifact.html")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent-service && uv run pytest tests/test_context.py tests/test_sdk_tools.py -v`
Expected: FAIL — pydantic `ValidationError` (missing `created_at`) in test_context; `ImportError: cannot import name 'ARTIFACT_KINDS'` in test_sdk_tools.

- [ ] **Step 3: Implement context.py publish**

In `apps/agent-service/src/agent_service/context.py`, add `ev_artifact` to the `from .models import (...)` block, then replace `add_artifact`:

```python
    async def add_artifact(self, name: str, media_type: MediaType, content: str) -> Artifact:
        artifact = Artifact(
            id=new_id("art"), name=name, media_type=media_type, content=content,
            created_at=now_iso(),
        )
        self.run.artifacts.append(artifact)
        await db.add_artifact(self.run_id, artifact)
        hub.publish(self.run_id, ev_artifact(artifact))
        return artifact
```

- [ ] **Step 4: Implement db.py read-back**

In `apps/agent-service/src/agent_service/db.py` `get_run`, replace the artifacts mapping:

```python
        artifacts=[
            Artifact(id=a["id"], name=a["name"], media_type=a["media_type"],
                     content=a["content"], created_at=_iso(a["created_at"]) or "")
            for a in arts
        ],
```

(No INSERT change: the DB default stamps `created_at` on write; the model stamp feeds the live event, the DB stamp feeds reloads — both orderings are internally consistent.)

- [ ] **Step 5: Implement sdk.py html kind**

In `apps/agent-service/src/agent_service/tools/sdk.py`, add at module level (just above `READ_TOOLS`):

```python
# save_artifact kind → (media type, default file name). Unit-tested; keep in
# sync with the tool schema enum below.
ARTIFACT_KINDS: dict[str, tuple[str, str]] = {
    "markdown": ("text/markdown", "artifact.md"),
    "json": ("application/json", "artifact.json"),
    "html": ("text/html", "artifact.html"),
}
```

Replace the `save_artifact` `@tool(...)` decorator and the first three lines of `_artifact`:

```python
    @tool(
        "save_artifact",
        "Persist an artifact tied to this run (e.g. a Markdown postmortem, JSON report, or a "
        "self-contained HTML page with inline SVG charts). kind is 'markdown', 'json', or "
        "'html'. HTML artifacts render in a sandboxed viewer that blocks ALL network access — "
        "inline CSS/SVG/JS only, no external URLs. Returns the artifact id.",
        {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["markdown", "json", "html"]},
                "content": {"type": "string"},
                "name": {"type": "string", "description": "file name, e.g. postmortem.md or report.html"},
            },
            "required": ["kind", "content"],
        },
    )
    async def _artifact(args: dict) -> dict:
        media, default_name = ARTIFACT_KINDS.get(args["kind"], ARTIFACT_KINDS["markdown"])
```

(The rest of `_artifact` — `safe_artifact_name`, DB save, file copy — is unchanged; delete the old `kind`/`media`/`default_name` lines it replaces.)

- [ ] **Step 6: Update the RCA and incident-reporter prompts**

In `SYSTEM_PROMPTS` in the same file, replace the `"rca"` entry's final sentence `"When you reach a conclusion worth keeping, save a short Markdown summary with save_artifact."` so the entry ends with:

```python
        "the service, span, tenant, or metric. When you reach a conclusion worth keeping, save a "
        "short Markdown summary with save_artifact. When a visual would explain the finding "
        "better than prose — a latency curve, a before/after comparison, a dependency sketch — "
        "also save ONE HTML artifact (kind='html'): a single self-contained file, inline CSS and "
        "inline SVG only, no external URLs (the viewer blocks all network), dark background with "
        "light text, charts drawn from the REAL numbers your queries returned. Keep it focused — "
        "one clear figure beats a dashboard. For quick sketches inside Markdown, a ```mermaid "
        "fenced code block renders as a diagram."
```

And extend the `"incident-reporter"` entry so it ends with:

```python
        "Be specific and evidence-backed; this goes straight to the incident inbox. The "
        "postmortem may include ```mermaid fenced diagrams (e.g. an incident timeline or the "
        "failing dependency edge). If a chart materially helps (error-rate spike, latency "
        "before/after), additionally save ONE kind='html' artifact — self-contained, inline "
        "CSS/SVG only, no external resources, dark-themed, drawn from real query results."
```

- [ ] **Step 7: Run the full python suite**

Run: `cd apps/agent-service && uv run pytest tests -v`
Expected: PASS (all files).

- [ ] **Step 8: Commit**

```bash
git add apps/agent-service/src/agent_service/context.py apps/agent-service/src/agent_service/db.py apps/agent-service/src/agent_service/tools/sdk.py apps/agent-service/tests/test_context.py apps/agent-service/tests/test_sdk_tools.py
git commit -m "agent-service: publish artifact events, html artifact kind, drawing prompts"
```

---

### Task 4: run-feed — artifacts as interleaved feed parts (TDD)

**Files:**
- Modify: `apps/web/src/lib/run-feed.ts`
- Test: `apps/web/src/lib/run-feed.test.ts`

**Interfaces:**
- Consumes: `Artifact` (with `createdAt`) from Task 1.
- Produces: `RunFeedPart` union gains `{ kind: "artifact"; artifact: Artifact }`; `buildRunFeed` takes `Pick<AgentRun, "messages" | "toolCalls" | "approvals" | "artifacts">`; `feedPartKey` handles the new kind. Tasks 7–9 switch on `part.kind === "artifact"`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/lib/run-feed.test.ts`: add `Artifact` to the type import from `@obs/contracts`, add a factory next to `approval(...)`:

```ts
function artifact(
  id: string,
  createdAt: string,
  mediaType: Artifact["mediaType"] = "text/html",
): Artifact {
  return { id, name: `${id}.html`, mediaType, content: "<h1>x</h1>", createdAt };
}
```

Add `artifacts: []` to every existing `buildRunFeed({...})` call (six of them — the field becomes required). Then add two tests:

```ts
  it("interleaves artifacts chronologically", () => {
    const feed = buildRunFeed({
      messages: [msg("m-user", "user", at(0)), msg("m-final", "assistant", at(9))],
      toolCalls: [tool("t-save", at(5))],
      approvals: [],
      artifacts: [artifact("art-1", at(7))],
    });
    expect(feed.map(feedPartKey)).toEqual(["m-user", "t-save", "art-1", "m-final"]);
  });

  it("puts an artifact after the tool call that produced it on equal timestamps", () => {
    const feed = buildRunFeed({
      messages: [],
      toolCalls: [tool("t-save", at(5))],
      approvals: [],
      artifacts: [artifact("art-1", at(5))],
    });
    expect(feed.map(feedPartKey)).toEqual(["t-save", "art-1"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && bun run test`
Expected: FAIL — TS error (`artifacts` not accepted) / new assertions failing.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/run-feed.ts`: add `Artifact` to the type import; extend the union, rank, timestamp, build, and key functions:

```ts
export type RunFeedPart =
  | { kind: "message"; message: RunMessage }
  | { kind: "tool"; toolCall: ToolCall }
  | { kind: "approval"; approval: Approval }
  | { kind: "artifact"; artifact: Artifact };

// Tie-break for identical timestamps: the agent-service flushes narration
// *before* it starts the tool call, approvals are requested from inside a
// running tool, and artifacts are produced by a tool — so message < tool <
// approval < artifact within the same millisecond.
const KIND_RANK: Record<RunFeedPart["kind"], number> = {
  message: 0,
  tool: 1,
  approval: 2,
  artifact: 3,
};
```

In `timestampOf`, add:

```ts
    case "artifact":
      return Date.parse(part.artifact.createdAt);
```

In `buildRunFeed`, change the signature and parts list (and update its doc comment — artifacts now interleave instead of trailing):

```ts
export function buildRunFeed(
  run: Pick<AgentRun, "messages" | "toolCalls" | "approvals" | "artifacts">,
): RunFeedPart[] {
  const parts: RunFeedPart[] = [
    ...run.messages.map((message): RunFeedPart => ({ kind: "message", message })),
    ...run.toolCalls.map((toolCall): RunFeedPart => ({ kind: "tool", toolCall })),
    ...run.approvals.map((approval): RunFeedPart => ({ kind: "approval", approval })),
    ...run.artifacts.map((artifact): RunFeedPart => ({ kind: "artifact", artifact })),
  ];
```

In `feedPartKey`, add:

```ts
    case "artifact":
      return part.artifact.id;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && bun run test`
Expected: PASS (8 tests). Note: `bun run typecheck` MAY fail right now — `run-feed-item.tsx`'s `RunFeedItem` switch doesn't handle `"artifact"` yet. Task 7 closes that; don't typecheck-gate this task.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/run-feed.ts apps/web/src/lib/run-feed.test.ts
git commit -m "web: interleave artifacts as run-feed parts"
```

---

### Task 5: `wrapArtifactHtml` — CSP sandbox wrapper (TDD)

**Files:**
- Create: `apps/web/src/lib/artifact-view.ts`
- Test: `apps/web/src/lib/artifact-view.test.ts`

**Interfaces:**
- Produces: `wrapArtifactHtml(content: string): string`; `languageFor(mediaType: Artifact["mediaType"]): "html" | "markdown" | "json"`; `downloadArtifact(artifact: Artifact): void`. Task 7 consumes all three; Task 8/9 consume none directly.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/artifact-view.test.ts`:

```ts
import type { Artifact } from "@obs/contracts";
import { describe, expect, it } from "vitest";
import { ARTIFACT_CSP, languageFor, wrapArtifactHtml } from "./artifact-view";

describe("wrapArtifactHtml", () => {
  it("puts the CSP meta before any model-authored content", () => {
    const out = wrapArtifactHtml("<script>fetch('https://evil.example')</script>");
    const cspAt = out.indexOf("Content-Security-Policy");
    const contentAt = out.indexOf("<script>");
    expect(cspAt).toBeGreaterThan(-1);
    expect(cspAt).toBeLessThan(contentAt);
    expect(out).toContain(ARTIFACT_CSP);
  });

  it("blocks the network but allows inline styles, scripts, and data: images", () => {
    expect(ARTIFACT_CSP).toContain("default-src 'none'");
    expect(ARTIFACT_CSP).toContain("style-src 'unsafe-inline'");
    expect(ARTIFACT_CSP).toContain("script-src 'unsafe-inline'");
    expect(ARTIFACT_CSP).toContain("img-src data:");
  });

  it("keeps the artifact body intact", () => {
    const out = wrapArtifactHtml("<h1>KS drift</h1><svg><circle r='4'/></svg>");
    expect(out).toContain("<h1>KS drift</h1><svg><circle r='4'/></svg>");
  });
});

describe("languageFor", () => {
  it("maps media types to code-block languages", () => {
    expect(languageFor("text/html")).toBe("html");
    expect(languageFor("text/markdown")).toBe("markdown");
    expect(languageFor("application/json")).toBe("json");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && bun run test`
Expected: FAIL — cannot resolve `./artifact-view`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/artifact-view.ts`:

```ts
import type { Artifact } from "@obs/contracts";

/**
 * Viewer-side helpers for agent artifacts. HTML artifacts are model-authored
 * from possibly attacker-influenced telemetry (logs), so the preview iframe is
 * sandboxed (allow-scripts, NEVER allow-same-origin) and this CSP blocks every
 * network direction — inline CSS/JS/SVG and data: images only.
 */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
].join("; ");

/**
 * Wrap artifact HTML for `srcdoc`. Our doctype + CSP meta parse before any
 * model-authored markup, so the policy is active from the first byte; a nested
 * doctype/html inside `content` is ignored by the HTML parser.
 */
export function wrapArtifactHtml(content: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">` +
    `</head><body>${content}</body></html>`
  );
}

export function languageFor(mediaType: Artifact["mediaType"]): "html" | "markdown" | "json" {
  switch (mediaType) {
    case "text/html":
      return "html";
    case "text/markdown":
      return "markdown";
    case "application/json":
      return "json";
  }
}

export function downloadArtifact(artifact: Artifact): void {
  const blob = new Blob([artifact.content], { type: artifact.mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.name;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/artifact-view.ts apps/web/src/lib/artifact-view.test.ts
git commit -m "web: CSP-wrapped srcdoc helper for sandboxed artifact preview"
```

---

### Task 6: Mermaid rendering in Markdown

**Files:**
- Create: `apps/web/src/components/mermaid.tsx`
- Modify: `apps/web/src/components/markdown.tsx`
- Modify: `apps/web/package.json` (via `bun add mermaid`)

**Interfaces:**
- Consumes: `themeStore` (`~/lib/theme`), `useMountEffect` (`~/lib/use-mount-effect`).
- Produces: `<Mermaid chart={string} />`; `Markdown` renders ```` ```mermaid ```` fences through it. No other task imports `Mermaid` directly.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && bun add mermaid`
Expected: `mermaid` appears in `apps/web/package.json` dependencies. It ships its own types.

- [ ] **Step 2: Create the Mermaid component**

Create `apps/web/src/components/mermaid.tsx`:

```tsx
import { useState } from "react";
import { themeStore } from "~/lib/theme";
import { useMountEffect } from "~/lib/use-mount-effect";

let renderSeq = 0;

/**
 * Inner renderer: one async mermaid render per mount. The outer component
 * remounts it (key) on theme or source change, so no effect dependencies are
 * needed. mermaid itself is dynamically imported to keep it out of the main
 * bundle; SSR and first client paint both show the placeholder.
 */
function MermaidSvg({ chart, dark }: { chart: string; dark: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
          fontFamily: "inherit",
        });
        const rendered = await mermaid.render(`mmd-${renderSeq++}`, chart);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        // Not (yet) valid mermaid — e.g. a fence still streaming in. Show source.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  if (failed) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  if (svg === null) {
    return <div className="py-2 text-xs text-muted-foreground">Rendering diagram…</div>;
  }
  return (
    <div
      className="typeset-scroll my-4 [&_svg]:mx-auto [&_svg]:max-w-full"
      // eslint-disable-next-line react/no-danger — mermaid output, securityLevel: strict
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Mermaid({ chart }: { chart: string }) {
  const theme = themeStore.use();
  return <MermaidSvg key={`${theme}:${chart}`} chart={chart} dark={theme === "dark"} />;
}
```

- [ ] **Step 3: Wire it into Markdown**

Replace `apps/web/src/components/markdown.tsx` with:

```tsx
import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import { Mermaid } from "~/components/mermaid";
import { cn } from "~/lib/utils";

/**
 * Markdown rendering on the shadcn typeset system — postmortems, artifacts,
 * runbooks, and chat. Pass a preset class (`typeset-docs`, `typeset-chat`)
 * to set the rhythm for the surface. ```mermaid fences render as diagrams.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("typeset", className)}>
      <ReactMarkdown
        components={{
          table: ({ node: _node, ...props }) => (
            <div className="typeset-scroll">
              <table {...props} />
            </div>
          ),
          code: ({ node: _node, className: codeClass, children: code, ...props }) => {
            if (codeClass?.includes("language-mermaid") === true) {
              return <Mermaid chart={String(code).replace(/\n$/, "")} />;
            }
            return (
              <code className={codeClass} {...props}>
                {code}
              </code>
            );
          },
          // Unwrap the <pre> around mermaid fences so the diagram isn't boxed
          // in code-block styling; all other pre blocks are untouched.
          pre: ({ node: _node, children: pre, ...props }) => {
            const only = Array.isArray(pre) ? pre[0] : pre;
            if (isValidElement(only) && only.type === Mermaid) return only;
            return <pre {...props}>{pre}</pre>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and test**

Run: `cd apps/web && bun run typecheck && bun run test`
Expected: tests PASS; typecheck may still show ONLY the known Task-4 `run-feed-item.tsx` missing-artifact-case error (fixed in Task 7). If typecheck shows any *other* error, fix it here.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/components/mermaid.tsx apps/web/src/components/markdown.tsx bun.lock
git commit -m "web: render mermaid fences in markdown (lazy, theme-aware)"
```

---

### Task 7: ArtifactPanel + feed chip/card wiring

**Files:**
- Create: `apps/web/src/components/artifact-panel.tsx`
- Modify: `apps/web/src/components/run-feed-item.tsx`

**Interfaces:**
- Consumes: `wrapArtifactHtml`, `languageFor`, `downloadArtifact` (Task 5); `RunFeedPart` artifact kind (Task 4); AI Elements artifact primitives.
- Produces: `<ArtifactPanel artifact onClose className? />`; `RunFeedItem` gains optional `onOpenArtifact?: (artifact: Artifact) => void` and renders artifact parts (chip for `text/html`, card with an open action otherwise); `ArtifactCard` gains optional `onOpen`. Tasks 8–9 consume `ArtifactPanel` and `onOpenArtifact`.

- [ ] **Step 1: Create the panel**

Create `apps/web/src/components/artifact-panel.tsx`:

```tsx
import type { Artifact } from "@obs/contracts";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";
import {
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
  Artifact as ArtifactPanelRoot,
} from "~/components/ai-elements/artifact";
import { CodeBlock } from "~/components/ai-elements/code-block";
import { Markdown } from "~/components/markdown";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { downloadArtifact, languageFor, wrapArtifactHtml } from "~/lib/artifact-view";
import { cn } from "~/lib/utils";

type View = "preview" | "code";

/**
 * Split-pane artifact viewer. HTML previews render in a sandboxed iframe:
 * allow-scripts WITHOUT allow-same-origin (unique opaque origin — no cookies,
 * no storage, no parent DOM) plus a CSP that blocks all network. See
 * ~/lib/artifact-view.ts for the threat model.
 */
export function ArtifactPanel({
  artifact,
  onClose,
  className,
}: {
  artifact: Artifact;
  onClose: () => void;
  className?: string;
}) {
  const [view, setView] = useState<View>("preview");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ArtifactPanelRoot className={cn("min-h-0", className)}>
      <ArtifactHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ArtifactTitle className="truncate font-mono">{artifact.name}</ArtifactTitle>
          <Badge variant="outline" className="text-muted-foreground">
            {artifact.mediaType}
          </Badge>
        </div>
        <ArtifactActions>
          <div className="mr-1 flex items-center rounded-md border p-0.5">
            <Button
              size="xs"
              variant={view === "preview" ? "secondary" : "ghost"}
              onClick={() => setView("preview")}
            >
              Preview
            </Button>
            <Button
              size="xs"
              variant={view === "code" ? "secondary" : "ghost"}
              onClick={() => setView("code")}
            >
              Code
            </Button>
          </div>
          <ArtifactAction
            icon={copied ? CheckIcon : CopyIcon}
            tooltip={copied ? "Copied" : "Copy contents"}
            label="Copy artifact contents"
            onClick={() => void copy()}
          />
          <ArtifactAction
            icon={DownloadIcon}
            tooltip="Download"
            label="Download artifact"
            onClick={() => downloadArtifact(artifact)}
          />
          <ArtifactClose onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      {view === "code" ? (
        <ArtifactContent className="p-0">
          <CodeBlock
            code={artifact.content}
            language={languageFor(artifact.mediaType)}
            className="rounded-none border-0"
          />
        </ArtifactContent>
      ) : artifact.mediaType === "text/html" ? (
        <iframe
          title={artifact.name}
          sandbox="allow-scripts"
          srcDoc={wrapArtifactHtml(artifact.content)}
          className="min-h-0 w-full flex-1 border-0 bg-background"
        />
      ) : artifact.mediaType === "text/markdown" ? (
        <ArtifactContent className="px-5 py-4">
          <Markdown className="typeset-docs">{artifact.content}</Markdown>
        </ArtifactContent>
      ) : (
        <ArtifactContent className="p-0">
          <CodeBlock code={artifact.content} language="json" className="rounded-none border-0" />
        </ArtifactContent>
      )}
    </ArtifactPanelRoot>
  );
}
```

- [ ] **Step 2: Wire artifacts into the feed**

In `apps/web/src/components/run-feed-item.tsx`:

Add to imports: `FileCodeIcon, Maximize2Icon` (lucide-react); `downloadArtifact` from `~/lib/artifact-view` (and delete the local `download()` body in `ArtifactCard` in favor of it).

Change `RunFeedItem` to accept and route the callback, and handle the new kind:

```tsx
export function RunFeedItem({
  part,
  streaming = false,
  onOpenArtifact,
}: {
  part: RunFeedPart;
  streaming?: boolean;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  switch (part.kind) {
    case "message":
      // … existing message branch unchanged …
    case "tool":
      return <FeedToolCall toolCall={part.toolCall} />;
    case "approval":
      return <FeedApproval approval={part.approval} />;
    case "artifact":
      return part.artifact.mediaType === "text/html" ? (
        <ArtifactChip artifact={part.artifact} onOpen={onOpenArtifact} />
      ) : (
        <ArtifactCard artifact={part.artifact} onOpen={onOpenArtifact} />
      );
  }
}
```

Add the chip component:

```tsx
/** Compact Claude-style chip for rendered (HTML) artifacts — click to open. */
function ArtifactChip({
  artifact,
  onOpen,
}: {
  artifact: Artifact;
  onOpen?: (artifact: Artifact) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(artifact)}
      className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-ring/40 hover:bg-muted/50"
    >
      <FileCodeIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm font-medium">{artifact.name}</span>
        <span className="text-xs text-muted-foreground">Rendered page · click to open</span>
      </span>
      <Maximize2Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  );
}
```

Extend `ArtifactCard` with the optional open action — change its signature to `{ artifact, onOpen }: { artifact: Artifact; onOpen?: (artifact: Artifact) => void }`, replace its `download()` with `downloadArtifact(artifact)`, and add before the copy action inside `<ArtifactActions>`:

```tsx
          {onOpen !== undefined ? (
            <ArtifactAction
              icon={Maximize2Icon}
              tooltip="Open in panel"
              label="Open in side panel"
              onClick={() => onOpen(artifact)}
            />
          ) : null}
```

- [ ] **Step 3: Typecheck and test**

Run: `cd apps/web && bun run typecheck && bun run test`
Expected: BOTH PASS — this task closes the non-exhaustive-switch debt from Task 4. (`$runId.tsx` still calls `<ArtifactCard artifact={...} />` without `onOpen`; that stays valid since the prop is optional.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/artifact-panel.tsx apps/web/src/components/run-feed-item.tsx
git commit -m "web: artifact panel with sandboxed HTML preview, feed chip/card wiring"
```

---

### Task 8: Run detail page — split pane

**Files:**
- Modify: `apps/web/src/routes/agents/runs/$runId.tsx`

**Interfaces:**
- Consumes: `ArtifactPanel` (Task 7), `onOpenArtifact` prop (Task 7), artifact feed parts (Task 4).

- [ ] **Step 1: Integrate the panel**

In `apps/web/src/routes/agents/runs/$runId.tsx`:

1. Imports: add `useState` to the react import; add `import type { Artifact } from "@obs/contracts";`, `import { ArtifactPanel } from "~/components/artifact-panel";`, `import { cn } from "~/lib/utils";`. Change the run-feed-item import to `import { RunFeedItem } from "~/components/run-feed-item";` (drop `ArtifactCard`).
2. State, next to the existing refs: `const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);`
3. Replace the outer wrapper `<div className="mx-auto max-w-3xl px-6 py-6">` (the main return, not the not-found branch) with a two-column shell; the entire current page content becomes the first child:

```tsx
    <div
      className={cn(
        "mx-auto px-6 py-6",
        openArtifact !== null
          ? "grid max-w-none grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]"
          : "max-w-3xl",
      )}
    >
      <div className="min-w-0">
        {/* …everything currently inside the wrapper: header, approval banner, feed… */}
      </div>

      {openArtifact !== null ? (
        <div className="max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:bg-background max-lg:p-3 lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)]">
          <ArtifactPanel
            artifact={openArtifact}
            onClose={() => setOpenArtifact(null)}
            className="h-full"
          />
        </div>
      ) : null}
    </div>
```

(The `100dvh-8rem` accounts for the top bar + page padding; adjust visually in Task 10 if it clips.)

4. Feed items: pass the callback — `<RunFeedItem key={feedPartKey(part)} part={part} onOpenArtifact={setOpenArtifact} />`.
5. Delete the trailing artifacts block (artifacts now arrive interleaved through `buildRunFeed`):

```tsx
        {run.artifacts.map((artifact) => (
          <ArtifactCard key={artifact.id} artifact={artifact} />
        ))}
```

- [ ] **Step 2: Typecheck and test**

Run: `cd apps/web && bun run typecheck && bun run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/src/routes/agents/runs/$runId.tsx'
git commit -m "web: split-pane artifact viewer on the run detail page"
```

---

### Task 9: Live chat — artifact events, auto-open, split pane

**Files:**
- Modify: `apps/web/src/routes/agents/index.tsx`

**Interfaces:**
- Consumes: `artifact` SSE event (Task 1 schema — `readAgentStream` picks it up automatically), `ArtifactPanel` + `onOpenArtifact` (Task 7).

- [ ] **Step 1: Handle the event and add state**

In `apps/web/src/routes/agents/index.tsx`:

1. Imports: add `import type { Artifact } from "@obs/contracts";` (extend the existing type import), `import { ArtifactPanel } from "~/components/artifact-panel";`, `import { cn } from "~/lib/utils";`.
2. State, next to `approval`: `const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);`
3. In the stream `switch`, after the `tool_call` case:

```tsx
          case "artifact":
            setParts((p) => [...p, { kind: "artifact", artifact: event.artifact }]);
            // Claude-style: a rendered page opens itself as it lands.
            if (event.artifact.mediaType === "text/html") setOpenArtifact(event.artifact);
            break;
```

4. Pass the callback where feed items render: `<RunFeedItem part={part} streaming={…unchanged…} onOpenArtifact={setOpenArtifact} />`.

- [ ] **Step 2: Split the layout**

1. Outer grid — replace `className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]"` with:

```tsx
    <div
      className={cn(
        "mx-auto grid h-full grid-cols-1 gap-4 px-6 py-6",
        openArtifact === null
          ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_300px]"
          : "max-w-none lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]",
      )}
    >
```

2. Second column — the panel replaces the "Recent runs" sidebar while open:

```tsx
      {openArtifact === null ? (
        <div className="flex min-h-0 flex-col gap-4">
          {/* …existing Recent runs Card unchanged… */}
        </div>
      ) : (
        <div className="min-h-0 max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:bg-background max-lg:p-3">
          <ArtifactPanel
            artifact={openArtifact}
            onClose={() => setOpenArtifact(null)}
            className="h-full"
          />
        </div>
      )}
```

- [ ] **Step 3: Typecheck and test**

Run: `cd apps/web && bun run typecheck && bun run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/agents/index.tsx
git commit -m "web: stream artifact events into live chat with auto-open split pane"
```

---

### Task 10: End-to-end verification (manual, full stack)

**Files:** none (verification; small CSS fixes to `$runId.tsx` / `index.tsx` / `artifact-panel.tsx` allowed).

- [ ] **Step 1: Start the stack**

Run (three terminals, or confirm already running): `obs up`, then `obs agents` (agent-service :8090 — restart it if already running so the new code loads), then `obs web` (:3003).

- [ ] **Step 2: Live HTML artifact**

On http://localhost:3003/agents ask: *"Query the p95 latency of the gateway over the last 30 minutes with Mimir, then save an HTML artifact with an SVG chart of it titled latency-report.html."*
Expected: tool calls stream inline → an `artifact` chip appears → the split pane auto-opens with the rendered chart; chat keeps streaming beside it; Close restores the single column; the chip reopens it. Preview/Code tabs both work.

- [ ] **Step 3: Sandbox check**

With the panel open, open devtools → Network, filter by the iframe. Reload the run page and reopen the artifact.
Expected: zero network requests originate from the iframe. Optionally ask the agent for an artifact containing `<script>fetch('https://example.com')</script>` — the fetch must be CSP-blocked (console error inside the iframe, no request row).

- [ ] **Step 4: Persistence + interleaving**

Open the run from "Recent runs" (the persisted run detail page).
Expected: the artifact chip sits chronologically after the `save_artifact` tool call (not trailing at the bottom); opening it splits the page; older pre-feature runs still render (their artifacts got `created_at` from the DB default).

- [ ] **Step 5: Mermaid**

Ask: *"Explain the request path from gateway to model-proxy with a mermaid diagram."*
Expected: the fence renders as a diagram in chat (source shows briefly while streaming, then the diagram); toggling the theme (top bar) re-renders it in the matching mermaid theme.

- [ ] **Step 6: Regression sweep**

`cd apps/web && bun run typecheck && bun run test && bun run lint`, and `cd apps/agent-service && uv run pytest tests -v`.
Expected: all PASS.

- [ ] **Step 7: Commit any verification fixes**

```bash
git add -A apps/web
git commit -m "web: polish artifact split-pane sizing from e2e verification"
```

(Skip if nothing changed.)
