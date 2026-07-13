import { MAX_PROMPT_CHARS } from "@obs/domain";

/**
 * Traffic scenarios. Each one targets a tenant from the dev registry (ADR-002 §4)
 * and produces a request body designed to drive a particular gateway outcome.
 */
export type ScenarioName = "happy" | "repeat" | "long" | "abusive" | "broken";

export interface Scenario {
  readonly name: ScenarioName;
  /** Relative selection weight. */
  readonly weight: number;
  /** Bearer token for the target tenant. */
  readonly token: string;
}

/** Dev tenant tokens (ADR-002 §4). */
const TOKEN_ACME = "dev-local-token";
const TOKEN_BRAVO = "dev-token-bravo";
const TOKEN_ABUSER = "dev-token-abuser";

/** Default weights ~ 55/20/10/10/5 (spec §6.5). */
export const SCENARIOS: readonly Scenario[] = [
  { name: "happy", weight: 55, token: TOKEN_ACME },
  { name: "repeat", weight: 20, token: TOKEN_BRAVO },
  { name: "long", weight: 10, token: TOKEN_ACME },
  { name: "abusive", weight: 10, token: TOKEN_ABUSER },
  { name: "broken", weight: 5, token: TOKEN_ACME },
] as const;

/**
 * Parse a `SCENARIO_WEIGHTS` spec like `"long:80,happy:20"` into a scenario
 * mix: listed scenarios get the given weight (token inherited from the base
 * mix), unlisted ones are dropped. Lets the CLI drive skewed traffic — e.g. a
 * long-prompt-heavy mix for data-drift tests or an abuser-heavy 429 storm.
 */
export function parseScenarioWeights(spec: string): Scenario[] {
  const entries = spec
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (entries.length === 0) throw new Error("SCENARIO_WEIGHTS is empty");

  return entries.map((entry) => {
    const [name, rawWeight] = entry.split(":").map((s) => s.trim());
    const base = SCENARIOS.find((s) => s.name === name);
    if (!base) {
      const known = SCENARIOS.map((s) => s.name).join(", ");
      throw new Error(`unknown scenario "${name}" in SCENARIO_WEIGHTS (known: ${known})`);
    }
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`scenario "${name}" needs a positive weight, got "${rawWeight}"`);
    }
    return { name: base.name, weight, token: base.token };
  });
}

/** Small fixed prompt set for the cache-friendly `repeat` scenario. */
export const REPEAT_PROMPTS: readonly string[] = [
  "What is observability?",
  "Explain retrieval augmented generation.",
  "How does a token bucket rate limiter work?",
  "Summarize the plot in one sentence.",
] as const;

const HAPPY_PROMPTS: readonly string[] = [
  "Tell me something interesting about the corpus.",
  "What themes appear most often in the text?",
  "Give me a short summary of a passage.",
  "Who are the main characters?",
  "Describe the setting in a few words.",
] as const;

/**
 * Pick a scenario by weight. `rng` returns a float in [0, 1) (defaults to
 * Math.random) so selection can be made deterministic in tests.
 */
export function pickScenario(
  rng: () => number = Math.random,
  scenarios: readonly Scenario[] = SCENARIOS,
): Scenario {
  const total = scenarios.reduce((sum, s) => sum + s.weight, 0);
  let target = rng() * total;
  for (const s of scenarios) {
    target -= s.weight;
    if (target < 0) return s;
  }
  // rng() ~ 1 fallthrough: return the last scenario (guaranteed present).
  const last = scenarios[scenarios.length - 1];
  if (last === undefined) throw new Error("no scenarios configured");
  return last;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const idx = Math.floor(rng() * items.length);
  const item = items[idx];
  if (item === undefined) throw new Error("empty selection pool");
  return item;
}

/** A fully built HTTP request for the gateway `/v1/chat` endpoint. */
export interface BuiltRequest {
  readonly scenario: ScenarioName;
  readonly url: string;
  readonly init: RequestInit;
}

/**
 * Build the gateway request for a scenario. `broken` deliberately sends a
 * malformed/invalid body (raw text or a body missing `prompt`) to drive a 422;
 * everything else sends valid JSON. The very long prompt stays within the
 * contract's max so the request is heavy but well-formed.
 */
export function buildRequest(
  scenario: Scenario,
  gatewayUrl: string,
  rng: () => number = Math.random,
): BuiltRequest {
  const url = `${gatewayUrl}/v1/chat`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${scenario.token}`,
  };

  if (scenario.name === "broken") {
    // Half the time send non-JSON text, half the time JSON missing `prompt`.
    const body = rng() < 0.5 ? "{ this is not valid json" : JSON.stringify({ topK: 3 });
    return { scenario: scenario.name, url, init: { method: "POST", headers, body } };
  }

  let prompt: string;
  switch (scenario.name) {
    case "repeat":
      prompt = pick(REPEAT_PROMPTS, rng);
      break;
    case "long":
      // Heavy but valid: just under the contract's MAX_PROMPT_CHARS cap.
      prompt = `Long-context request: ${"lorem ipsum dolor sit amet ".repeat(300)}`.slice(
        0,
        MAX_PROMPT_CHARS,
      );
      break;
    default:
      // happy + abusive both send a normal valid prompt; abusive differs only
      // by tenant (abuser bucket is tiny so bursts trip 429).
      prompt = pick(HAPPY_PROMPTS, rng);
      break;
  }

  const body = JSON.stringify({ prompt, topK: 3 });
  return { scenario: scenario.name, url, init: { method: "POST", headers, body } };
}
