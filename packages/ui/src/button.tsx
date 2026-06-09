import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-sm font-mono text-xs uppercase tracking-[0.08em] transition-colors duration-150 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
  {
    variants: {
      variant: {
        signal: "bg-signal text-bg hover:bg-signal-dim border border-transparent",
        outline: "border border-rule text-ink-dim hover:border-signal-dim hover:text-signal",
        ghost: "text-ink-faint hover:text-ink hover:bg-elev",
        danger: "border border-warn/40 text-warn hover:bg-warn/10",
      },
      size: {
        sm: "h-7 px-2.5",
        md: "h-8 px-3.5",
        lg: "h-9 px-5",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
