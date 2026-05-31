import { describe, expect, it } from "vitest";
import { MAX_PROMPT_CHARS } from "@obs/domain";
import { ChatRequestSchema } from "@obs/contracts";
import { SCENARIOS, buildRequest, pickScenario } from "./scenarios";

const GATEWAY = "http://gateway:8080";

function findScenario(name: string) {
  const s = SCENARIOS.find((sc) => sc.name === name);
  if (!s) throw new Error(`missing scenario ${name}`);
  return s;
}

describe("pickScenario", () => {
  it("selects the first scenario when rng is 0", () => {
    expect(pickScenario(() => 0).name).toBe("happy");
  });

  it("selects the last scenario when rng is near 1", () => {
    expect(pickScenario(() => 0.999999).name).toBe("broken");
  });

  it("only ever returns configured scenarios", () => {
    const names = new Set(SCENARIOS.map((s) => s.name));
    for (let i = 0; i < 50; i++) {
      expect(names.has(pickScenario(() => i / 50).name)).toBe(true);
    }
  });
});

describe("buildRequest", () => {
  it("targets the acme tenant for happy traffic with a valid body", () => {
    const req = buildRequest(findScenario("happy"), GATEWAY, () => 0);
    expect(req.url).toBe(`${GATEWAY}/v1/chat`);
    const headers = req.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer dev-local-token");
    const parsed = ChatRequestSchema.safeParse(JSON.parse(req.init.body as string));
    expect(parsed.success).toBe(true);
  });

  it("uses the bravo tenant + a fixed prompt for the cache-friendly repeat scenario", () => {
    const req = buildRequest(findScenario("repeat"), GATEWAY, () => 0);
    const headers = req.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer dev-token-bravo");
  });

  it("uses the abuser tenant for the abusive scenario", () => {
    const req = buildRequest(findScenario("abusive"), GATEWAY, () => 0);
    const headers = req.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer dev-token-abuser");
  });

  it("produces a heavy but contract-valid prompt for the long scenario", () => {
    const req = buildRequest(findScenario("long"), GATEWAY, () => 0);
    const body = JSON.parse(req.init.body as string) as { prompt: string };
    expect(body.prompt.length).toBeGreaterThan(1000);
    expect(body.prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(ChatRequestSchema.safeParse(body).success).toBe(true);
  });

  it("emits an invalid body for the broken scenario (missing prompt path)", () => {
    const req = buildRequest(findScenario("broken"), GATEWAY, () => 0.9);
    const parsed = JSON.parse(req.init.body as string) as unknown;
    expect(ChatRequestSchema.safeParse(parsed).success).toBe(false);
  });

  it("emits malformed JSON for the broken scenario (non-JSON path)", () => {
    const req = buildRequest(findScenario("broken"), GATEWAY, () => 0.1);
    expect(() => JSON.parse(req.init.body as string)).toThrow();
  });
});
