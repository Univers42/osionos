/**
 * Textarea — the multi-line Input: the same field tokens, every native prop and the ref forwarded.
 * App-side because `@osionos/ui` ships no textarea; move it there when the package takes one.
 */

import React from "react";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={`min-h-20 w-full resize-y rounded-[var(--osio-field-radius)] border border-[var(--osio-field-border)] bg-[var(--osio-field-bg)] px-2.5 py-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:border-[var(--osio-field-border-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    {...props}
  />
));

Textarea.displayName = "Textarea";
