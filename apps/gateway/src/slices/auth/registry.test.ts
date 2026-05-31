import { describe, expect, it } from "vitest";
import { makeTenant } from "@obs/domain";
import { parseBearer } from "./middleware";
import { recordForTenant, resolveByToken } from "./registry";

describe("auth registry", () => {
  it("resolves each dev token to its tenant and bucket config", () => {
    expect(resolveByToken("dev-local-token")?.tenant).toBe("acme");
    expect(resolveByToken("dev-token-bravo")?.tenant).toBe("bravo");
    const abuser = resolveByToken("dev-token-abuser");
    expect(abuser?.tenant).toBe("abuser");
    expect(abuser).toMatchObject({ capacity: 20, refillPerSecond: 10 });
  });

  it("returns null for an unknown token", () => {
    expect(resolveByToken("nope")).toBeNull();
  });

  it("looks up bucket config by tenant", () => {
    expect(recordForTenant(makeTenant("acme"))).toMatchObject({
      capacity: 1000,
      refillPerSecond: 1000,
    });
  });
});

describe("parseBearer", () => {
  it("extracts the token from a well-formed header", () => {
    expect(parseBearer("Bearer abc123")).toBe("abc123");
    expect(parseBearer("bearer abc123")).toBe("abc123");
  });

  it("returns null for missing or malformed headers", () => {
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Token abc")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer   ")).toBeNull();
  });
});
