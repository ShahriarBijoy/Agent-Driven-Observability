import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Runbooks are plain Markdown files in the repo's `runbooks/` directory. The
 * dev server runs from `apps/web`, so the repo root is two levels up.
 */

export interface Runbook {
  slug: string;
  title: string;
  content: string;
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
    const content = await fs.promises.readFile(path.join(runbooksDir(), file), "utf-8");
    const heading = content.match(/^#\s+(.+)$/m)?.[1];
    books.push({
      slug: file.replace(/\.md$/, ""),
      title: heading ?? file,
      content,
    });
  }
  return books.sort((a, b) => a.slug.localeCompare(b.slug));
}
