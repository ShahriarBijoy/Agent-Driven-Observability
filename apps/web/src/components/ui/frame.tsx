import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";

/**
 * ReUI-style Frame (reui.io/components/frame), adapted to this app's tokens:
 * a bounded muted container whose header sits in the frame area and whose
 * panels render as inset cards. The Frame sets CSS vars (radius, paddings,
 * panel bg/border) that FrameHeader/FramePanel/FrameFooter consume, so the
 * spacing variants live in one place.
 */
const frameVariants = cva(
  [
    "relative flex flex-col rounded-(--frame-radius) bg-muted/50",
    "gap-(--frame-gap) p-(--frame-gap)",
    "[--frame-gap:--spacing(1)] [--frame-radius:var(--radius-xl)]",
    "[--frame-panel-bg:var(--color-card)] [--frame-panel-border:var(--color-border)]",
  ],
  {
    variants: {
      variant: {
        default: "border border-border bg-clip-padding",
        ghost: "",
      },
      spacing: {
        sm: [
          "[--frame-panel-px:--spacing(3)] [--frame-panel-py:--spacing(2.5)]",
          "[--frame-header-px:--spacing(2.5)] [--frame-header-py:--spacing(2)]",
        ],
        default: [
          "[--frame-panel-px:--spacing(4)] [--frame-panel-py:--spacing(3.5)]",
          "[--frame-header-px:--spacing(3)] [--frame-header-py:--spacing(2.5)]",
        ],
      },
    },
    defaultVariants: { variant: "default", spacing: "default" },
  },
);

function Frame({
  className,
  variant,
  spacing,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof frameVariants>) {
  return (
    <div
      data-slot="frame"
      className={cn(frameVariants({ variant, spacing }), className)}
      {...props}
    />
  );
}

/** Sits in the muted frame area, above (or between) panels. */
function FrameHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="frame-header"
      className={cn(
        "flex items-center gap-2.5 px-(--frame-header-px) py-(--frame-header-py)",
        className,
      )}
      {...props}
    />
  );
}

function FrameTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="frame-title" className={cn("text-sm font-medium", className)} {...props} />
  );
}

function FrameDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="frame-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The inset card. `fit` sizes it to content instead of growing to fill. */
function FramePanel({ className, fit, ...props }: React.ComponentProps<"div"> & { fit?: boolean }) {
  return (
    <div
      data-slot="frame-panel"
      className={cn(
        "relative overflow-hidden rounded-[calc(var(--frame-radius)-2px)] border border-(--frame-panel-border) bg-(--frame-panel-bg) bg-clip-padding shadow-xs",
        !fit && "grow",
        "px-(--frame-panel-px) py-(--frame-panel-py)",
        className,
      )}
      {...props}
    />
  );
}

function FrameFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="frame-footer"
      className={cn(
        "flex items-center gap-2 px-(--frame-header-px) py-(--frame-header-py)",
        className,
      )}
      {...props}
    />
  );
}

export { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle, frameVariants };
