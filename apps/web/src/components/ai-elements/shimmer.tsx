import type { CSSProperties, ElementType } from "react";
import { memo } from "react";
import { cn } from "~/lib/utils";

export interface ShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

/**
 * AI Elements' Shimmer, ported like the rest of ~/components/ai-elements: the
 * upstream component animates one linear background-position sweep with
 * motion/react, which a CSS keyframe (styles.css: shimmer-sweep) reproduces
 * without the dependency. Muted text with a highlight band sweeping across —
 * the chat's "what is the agent doing right now" line.
 */
const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: ShimmerProps) => (
  <Component
    className={cn(
      "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
      "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
      "animate-[shimmer-sweep_var(--shimmer-duration)_linear_infinite]",
      className,
    )}
    style={
      {
        "--spread": `${(children?.length ?? 0) * spread}px`,
        "--shimmer-duration": `${duration}s`,
        backgroundImage:
          "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
      } as CSSProperties
    }
  >
    {children}
  </Component>
);

export const Shimmer = memo(ShimmerComponent);
