import { useSyncExternalStore } from "react";

/**
 * Minimal external store backed by localStorage — used for operator-local UI
 * state (tenant, time range) that must survive reloads and never trigger
 * effect choreography. Read via useSyncExternalStore, written from event
 * handlers only.
 */
export function createLocalStore<T extends string>(key: string, fallback: T, valid: readonly T[]) {
  const listeners = new Set<() => void>();

  function read(): T {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw !== null && (valid as readonly string[]).includes(raw) ? (raw as T) : fallback;
  }

  function set(value: T): void {
    window.localStorage.setItem(key, value);
    for (const l of listeners) l();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function use(): T {
    return useSyncExternalStore(subscribe, read, () => fallback);
  }

  return { use, set, read };
}
