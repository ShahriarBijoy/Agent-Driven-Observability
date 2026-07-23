import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Runbooks are plain Markdown files in the repo's `runbooks/` directory. The
 * dev server runs from `apps/web`, so the repo root is two levels up.
 */

export interface Runbook {
  slug: string;
  title: string;
  /** Document body with the YAML frontmatter stripped — what the viewer renders. */
  content: string;
  /** Frontmatter `alert_types`: the alerts that route to this runbook. */
  alertTypes: string[];
  /** Frontmatter `tools`: the narrowed toolset the executor gets. */
  tools: string[];
}

/**
 * The runbook frontmatter is a tiny, known dialect (flow lists only), so a
 * scoped parser beats pulling in a YAML dependency: extract `alert_types` and
 * `tools`, and return the body without the frontmatter block — the raw block
 * rendered as Markdown reads as garbled prose in the viewer.
 */
function parseFrontmatter(raw: string): Pick<Runbook, "content" | "alertTypes" | "tools"> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match === null) return { content: raw, alertTypes: [], tools: [] };
  const frontmatter = match[1]!;
  const flowList = (key: string): string[] => {
    const list = frontmatter.match(new RegExp(`^${key}:\\s*\\[([\\s\\S]*?)\\]`, "m"));
    if (list === null) return [];
    return list[1]!
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  };
  return {
    content: raw.slice(match[0].length),
    alertTypes: flowList("alert_types"),
    tools: flowList("tools"),
  };
}

function runbooksDir(): string {
  return path.resolve(process.cwd(), "..", "..", "runbooks");
}

export async function listRunbooks(): Promise<Runbook[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(runbooksDir());
  } catch {
    return [];
  }
  const books: Runbook[] = [];
  for (const file of entries.filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")) {
    const raw = await fs.promises.readFile(path.join(runbooksDir(), file), "utf-8");
    const { content, alertTypes, tools } = parseFrontmatter(raw);
    const heading = content.match(/^#\s+(.+)$/m)?.[1];
    books.push({
      slug: file.replace(/\.md$/, ""),
      title: heading ?? file,
      content,
      alertTypes,
      tools,
    });
  }
  return books.sort((a, b) => a.slug.localeCompare(b.slug));
}
