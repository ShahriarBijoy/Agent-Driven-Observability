import type { ChaosPhase, ChaosTarget } from "./schedule";

/** A fetch-shaped function (the global `fetch`, or a fake one in tests). */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface AdminDeps {
  /** Base URL per chaos target (e.g. `{ "model-proxy": "http://localhost:8083" }`). */
  readonly baseUrls: Readonly<Record<ChaosTarget, string>>;
  readonly fetchFn?: FetchFn;
  readonly log?: (msg: string) => void;
}

function adminUrl(deps: AdminDeps, target: ChaosTarget): string {
  return `${deps.baseUrls[target].replace(/\/+$/, "")}/admin/chaos`;
}

/** POST a phase's params to its target's chaos control plane. Best-effort. */
export async function applyPhase(deps: AdminDeps, phase: ChaosPhase): Promise<void> {
  const fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
  try {
    const res = await fetchFn(adminUrl(deps, phase.target), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(phase.params),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deps.log?.(`[chaos] ▶ apply  ${phase.name} → ${phase.target} ${JSON.stringify(phase.params)}`);
  } catch (err) {
    deps.log?.(`[chaos] ! apply  ${phase.name} → ${phase.target} failed: ${String(err)}`);
  }
}

/** DELETE (clear) a phase's chaos on its target. Best-effort. */
export async function clearPhase(deps: AdminDeps, phase: ChaosPhase): Promise<void> {
  const fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
  try {
    const res = await fetchFn(adminUrl(deps, phase.target), { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deps.log?.(`[chaos] ■ clear  ${phase.name} → ${phase.target}`);
  } catch (err) {
    deps.log?.(`[chaos] ! clear  ${phase.name} → ${phase.target} failed: ${String(err)}`);
  }
}

/** Best-effort: clear chaos on every known target (safety net at shutdown). */
export async function resetAll(deps: AdminDeps): Promise<void> {
  const fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
  const targets = Object.keys(deps.baseUrls) as ChaosTarget[];
  await Promise.all(
    targets.map(async (target) => {
      try {
        await fetchFn(adminUrl(deps, target), { method: "DELETE" });
      } catch {
        // best-effort cleanup; ignore.
      }
    }),
  );
}
