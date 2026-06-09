import { useEffect } from "react";

/** The only sanctioned effect: one-time external-system sync on mount. */
export function useMountEffect(effect: () => void | (() => void)) {
  // oxlint-disable-next-line exhaustive-deps
  useEffect(effect, []);
}
