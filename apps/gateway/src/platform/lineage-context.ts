// Request-scoped OpenLineage parent context. The inference service binds the
// current `rag.inference` run as the parent for the duration of its embed +
// retrieve calls; the upstream client reads it to stamp `x-ol-parent-*` headers
// so the embedder/retriever can link their sub-runs back to it.

import { AsyncLocalStorage } from "node:async_hooks";
import { type ParentRef, parentRunHeaders } from "@obs/lineage";

const store = new AsyncLocalStorage<ParentRef>();

/** Run `fn` with `parent` bound as the active OpenLineage parent run. */
export function runWithParent<T>(parent: ParentRef, fn: () => Promise<T>): Promise<T> {
  return store.run(parent, fn);
}

/** Parent-run headers for the active context, or `{}` when there is none. */
export function currentParentHeaders(): Record<string, string> {
  const parent = store.getStore();
  return parent ? parentRunHeaders(parent) : {};
}
