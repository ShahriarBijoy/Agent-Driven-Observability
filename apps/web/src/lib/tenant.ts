import { createLocalStore } from "./store";

/** Mirrors the gateway's hardcoded dev tenant registry (ADR-002 §4). */
export const TENANTS = ["test-bench", "bravo", "abuser"] as const;
export type TenantId = (typeof TENANTS)[number];

export const tenantStore = createLocalStore<TenantId>("obs-lab.tenant", "test-bench", TENANTS);
