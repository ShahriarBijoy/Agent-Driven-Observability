import { makeTenant } from "@obs/domain";
import type { Tenant } from "@obs/domain";

/** A dev tenant: its bearer token plus its token-bucket rate-limit parameters. */
export interface TenantRecord {
  readonly tenant: Tenant;
  readonly token: string;
  /** Token-bucket capacity (max burst). */
  readonly capacity: number;
  /** Tokens refilled per second. */
  readonly refillPerSecond: number;
}

/**
 * Hardcoded dev tenant registry (ADR-002 §4). `acme`/`bravo` are generous so a
 * load test sustains ≥100 rps; `abuser` is tiny so the abusive scenario trips
 * 429 reliably. The `acme` token is also surfaced via the `DEV_TOKEN` env var.
 */
const RECORDS: readonly TenantRecord[] = [
  { tenant: makeTenant("acme"), token: "dev-local-token", capacity: 1000, refillPerSecond: 1000 },
  { tenant: makeTenant("bravo"), token: "dev-token-bravo", capacity: 1000, refillPerSecond: 1000 },
  { tenant: makeTenant("abuser"), token: "dev-token-abuser", capacity: 20, refillPerSecond: 10 },
];

const BY_TOKEN: ReadonlyMap<string, TenantRecord> = new Map(RECORDS.map((r) => [r.token, r]));
const BY_TENANT: ReadonlyMap<string, TenantRecord> = new Map(RECORDS.map((r) => [r.tenant, r]));

/** Resolve a tenant record by bearer token, or `null` if the token is unknown. */
export function resolveByToken(token: string): TenantRecord | null {
  return BY_TOKEN.get(token) ?? null;
}

/** Look up a tenant's rate-limit parameters by tenant id. */
export function recordForTenant(tenant: Tenant): TenantRecord | null {
  return BY_TENANT.get(tenant) ?? null;
}

export function allTenants(): readonly TenantRecord[] {
  return RECORDS;
}
