import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const fieldClasses =
  "w-full rounded-sm border border-rule bg-inset px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-signal-dim";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, "min-h-16 resize-y", className)} {...props} />;
}
