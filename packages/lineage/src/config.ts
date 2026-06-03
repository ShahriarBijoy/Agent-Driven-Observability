// Resolve lineage emitter options from the environment. Lineage auto-enables
// when MARQUEZ_URL is present (as it is under compose), and can be forced on or
// off via LINEAGE_ENABLED. Kept dependency-free so services can call it from
// their own config layer.

const DEFAULT_URL = "http://marquez-api:5000";

export interface LineageOptions {
  readonly url: string;
  readonly enabled: boolean;
}

export function resolveLineageOptions(
  env: Record<string, string | undefined> = process.env,
): LineageOptions {
  const url = env.MARQUEZ_URL ?? DEFAULT_URL;
  const flag = env.LINEAGE_ENABLED;
  let enabled: boolean;
  if (flag === "true") {
    enabled = true;
  } else if (flag === "false") {
    enabled = false;
  } else {
    enabled = env.MARQUEZ_URL !== undefined && env.MARQUEZ_URL !== "";
  }
  return { url, enabled };
}
