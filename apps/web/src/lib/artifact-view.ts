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
