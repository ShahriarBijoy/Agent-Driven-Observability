import { timeAgo } from "~/lib/format";

/**
 * Relative timestamps depend on the wall clock, so server HTML and client
 * hydration can legitimately differ — suppress that one mismatch instead of
 * letting React regenerate the tree.
 */
export function TimeAgo({ iso }: { iso: string }) {
  return <span suppressHydrationWarning>{timeAgo(iso)}</span>;
}
