import { cn } from "./cn";

/** Mono-character spinner — fits the instrument-panel idiom better than a ring. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={cn(
        "inline-block size-3 animate-spin rounded-full border border-ink-faint border-t-signal",
        className,
      )}
    />
  );
}
