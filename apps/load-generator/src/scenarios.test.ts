import { describe, expect, it } from "vitest";
import { MAX_PROMPT_CHARS } from "@obs/domain";
import { ChatRequestSchema } from "@obs/contracts";
import { SCENARIOS, buildRequest, parseScenarioWeights, pickScenario } from "./scenarios";

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

describe("parseScenarioWeights", () => {
  it("reweights the listed scenarios and drops the rest", () => {
    const mix = parseScenarioWeights("long:80,happy:20");
    expect(mix.map((s) => s.name).sort()).toEqual(["happy", "long"]);
    expect(mix.find((s) => s.name === "long")?.weight).toBe(80);
    expect(mix.find((s) => s.name === "happy")?.weight).toBe(20);
  });

  it("keeps the base scenario's token for each entry", () => {
    const mix = parseScenarioWeights("abusive:70,happy:30");
    const abusive = mix.find((s) => s.name === "abusive");
    expect(abusive?.token).toBe(findScenario("abusive").token);
  });

  it("tolerates whitespace around entries", () => {
    const mix = parseScenarioWeights(" repeat:1 , broken:2 ");
    expect(mix.map((s) => s.name).sort()).toEqual(["broken", "repeat"]);
  });

  it("rejects unknown scenario names", () => {
    expect(() => parseScenarioWeights("nope:50,happy:50")).toThrow(/unknown scenario/i);
  });

  it("rejects non-positive or non-numeric weights", () => {
    expect(() => parseScenarioWeights("happy:0")).toThrow(/weight/i);
    expect(() => parseScenarioWeights("happy:abc")).toThrow(/weight/i);
  });

  it("rejects an empty spec", () => {
    expect(() => parseScenarioWeights("")).toThrow(/empty/i);
  });

  it("feeds pickScenario so only listed scenarios are selected", () => {
    const mix = parseScenarioWeights("long:100");
    for (let i = 0; i < 10; i++) {
      expect(pickScenario(() => i / 10, mix).name).toBe("long");
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
