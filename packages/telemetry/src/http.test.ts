import { describe, expect, it } from "vitest";
import { routeOf, UNMATCHED_ROUTE } from "./http";

const req = (routePath: string | undefined, path: string) => ({ req: { routePath, path } });

describe("routeOf", () => {
  it("uses the matched route template", () => {
    expect(routeOf(req("/v1/chat", "/v1/chat"))).toBe("/v1/chat");
  });

  it("keeps the template, not the concrete path, for parameterised routes", () => {
    // The whole point of a template: /v1/runs/:id is ONE series no matter how
    // many run ids exist.
    expect(routeOf(req("/v1/runs/:id", "/v1/runs/01HZX9"))).toBe("/v1/runs/:id");
  });

  it("collapses unmatched paths instead of labelling with the raw path", () => {
    // Regression: these are real credential-scanner probes that reached the
    // gateway. Each one used to become its own Mimir series.
    for (const probe of [
      "/.env",
      "/.aws/credentials",
      "/.git/config",
      "/.config/codex/auth.json",
      "/.env.production.local",
    ]) {
      expect(routeOf(req(undefined, probe))).toBe(UNMATCHED_ROUTE);
    }
  });

  it("treats a catch-all match as unmatched", () => {
    expect(routeOf(req("/*", "/anything/at/all"))).toBe(UNMATCHED_ROUTE);
  });

  it("emits one label value across many distinct unmatched paths", () => {
    const labels = new Set(
      Array.from({ length: 500 }, (_, i) => routeOf(req(undefined, `/.env.${i}`))),
    );
    expect(labels.size).toBe(1);
  });
});
