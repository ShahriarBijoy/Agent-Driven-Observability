import { describe, expect, it } from "vitest";
import { resolveLineageOptions } from "./config";

describe("resolveLineageOptions", () => {
  it("is disabled by default when nothing is configured", () => {
    expect(resolveLineageOptions({})).toEqual({
      url: "http://marquez-api:5000",
      enabled: false,
    });
  });

  it("auto-enables when MARQUEZ_URL is set", () => {
    expect(resolveLineageOptions({ MARQUEZ_URL: "http://marquez-api:5000" })).toEqual({
      url: "http://marquez-api:5000",
      enabled: true,
    });
  });

  it("honours an explicit LINEAGE_ENABLED=false even when a URL is set", () => {
    expect(
      resolveLineageOptions({ MARQUEZ_URL: "http://m:5000", LINEAGE_ENABLED: "false" }).enabled,
    ).toBe(false);
  });

  it("force-enables with the default URL when LINEAGE_ENABLED=true", () => {
    expect(resolveLineageOptions({ LINEAGE_ENABLED: "true" })).toEqual({
      url: "http://marquez-api:5000",
      enabled: true,
    });
  });
});
