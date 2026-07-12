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
