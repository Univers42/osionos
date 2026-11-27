import React from 'react';

/**
 * A miniature window painted with the real --osio-* tokens, so it follows mode, color theme,
 * accent, style, corners and density as they change. CSS only, no text: it is decoration, the
 * rows below say what each choice does.
 */
export const ThemePreview: React.FC = () => (
  <div
    aria-hidden="true"
    data-testid="theme-preview"
    className="relative mb-4 flex h-40 gap-2 overflow-hidden rounded-[var(--osio-radius-panel)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-canvas)] p-2"
  >
    <div className="flex w-16 shrink-0 flex-col gap-2 rounded-[var(--osio-radius-card)] bg-[var(--osio-bg-subtle)] p-2">
      <span className="h-2 w-full rounded-full bg-[var(--osio-accent)]" />
      <span className="h-2 w-3/4 rounded-full bg-[var(--osio-fg-muted)] opacity-40" />
      <span className="h-2 w-2/3 rounded-full bg-[var(--osio-fg-muted)] opacity-25" />
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-[var(--osio-space-3)] rounded-[var(--osio-radius-card)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-[var(--osio-space-4)] shadow-[var(--osio-e1)]">
      <span className="h-3 w-1/3 rounded-full bg-[var(--osio-fg-default)]" />
      <span className="h-2 w-5/6 rounded-full bg-[var(--osio-fg-muted)] opacity-60" />
      <span className="h-2 w-2/3 rounded-full bg-[var(--osio-fg-muted)] opacity-40" />
      <span className="mt-auto h-6 w-16 rounded-[var(--osio-radius-control)] bg-[var(--osio-accent)]" />
    </div>
    <div className="absolute right-4 top-4 flex w-20 flex-col gap-1.5 rounded-[var(--osio-radius-overlay)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] p-2 shadow-[var(--osio-e3)]">
      <span className="h-1.5 w-full rounded-full bg-[var(--osio-fg-default)] opacity-70" />
      <span className="h-1.5 w-2/3 rounded-full bg-[var(--osio-fg-muted)] opacity-50" />
    </div>
  </div>
);
