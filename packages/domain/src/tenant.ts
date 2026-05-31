import type { Brand } from "./brand";

/** A tenant identifier. Lowercase slug, 1–63 chars. */
export type Tenant = Brand<string, "Tenant">;

export class InvalidTenantError extends Error {
  constructor(value: string) {
    super(`invalid tenant id: ${JSON.stringify(value)}`);
    this.name = "InvalidTenantError";
  }
}

const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Smart constructor — the only sanctioned way to mint a {@link Tenant}. */
export function makeTenant(value: string): Tenant {
  const v = value.trim().toLowerCase();
  if (!TENANT_RE.test(v)) {
    throw new InvalidTenantError(value);
  }
  return v as Tenant;
}

/** Non-throwing variant; returns `null` when invalid. */
export function parseTenant(value: string): Tenant | null {
  const v = value.trim().toLowerCase();
  return TENANT_RE.test(v) ? (v as Tenant) : null;
}
