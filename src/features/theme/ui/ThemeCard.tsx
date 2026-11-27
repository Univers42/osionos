import React from 'react';

import type { ThemeDoc } from '@/shared/config/themeDoc';

const swatch = (doc: ThemeDoc | null, key: string): string => doc?.colors?.[key] ?? `var(--osio-${key})`;

/**
 * A miniature page painted from a theme's own colors (a missing key falls back to the live
 * `--osio-*` token, which is also how the Built-in card draws). Decoration only.
 */
const ThemeSwatch: React.FC<{ doc: ThemeDoc | null }> = ({ doc }) => (
  <span
    aria-hidden="true"
    className="relative block h-14 w-full overflow-hidden rounded-md border border-[var(--osio-border-default)]"
    style={{ background: swatch(doc, 'bg-page') }}
  >
    <span className="absolute inset-x-2 bottom-2 top-3 flex flex-col gap-1 rounded-sm p-1.5" style={{ background: swatch(doc, 'bg-surface') }}>
      <span className="block h-1.5 w-3/4 rounded-full" style={{ background: swatch(doc, 'fg-default') }} />
      <span className="block h-1.5 w-1/2 rounded-full opacity-60" style={{ background: swatch(doc, 'fg-default') }} />
      <span className="ml-auto mt-auto block h-2 w-5 rounded-full" style={{ background: swatch(doc, 'accent') }} />
    </span>
  </span>
);

export interface ThemeCardProps {
  name: string;
  doc: ThemeDoc | null;
  own: boolean;
  checked: boolean;
  tabIndex: 0 | -1;
  onSelect: (name: string | null) => void;
}

const baseLabel = (doc: ThemeDoc | null): string => (doc?.base === 'dark' ? 'Dark' : doc?.base === 'light' ? 'Light' : '');

/** One selectable theme in the gallery: a swatch, the name, a Light/Dark label and a "Yours" badge. */
export const ThemeCard = React.memo(function ThemeCard({ name, doc, own, checked, tabIndex, onSelect }: Readonly<ThemeCardProps>) {
  const label = baseLabel(doc);
  return (
    <div
      role="radio"
      aria-checked={checked}
      aria-label={name}
      tabIndex={tabIndex}
      data-theme-card={doc ? name : 'built-in'}
      onClick={() => onSelect(doc ? name : null)}
      className={`flex min-h-[44px] cursor-pointer flex-col gap-1.5 rounded-lg border bg-[var(--osio-bg-surface)] p-1.5 text-left transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] ${checked ? 'border-[var(--osio-accent)] ring-2 ring-[var(--osio-accent)]' : 'border-[var(--osio-border-default)] hover:border-[var(--osio-fg-muted)]'}`}
    >
      <ThemeSwatch doc={doc} />
      <span className="block truncate px-0.5 text-sm font-medium text-[var(--osio-fg-default)]" title={name}>{name}</span>
      <span className="flex flex-wrap items-center gap-1 px-0.5 text-xs text-[var(--osio-fg-muted)]">
        {doc ? null : <span>Follows Mode and Color theme</span>}
        {label ? <span data-theme-base={label}>{label}</span> : null}
        {own ? <span className="rounded-sm border border-[var(--osio-border-default)] px-1">Yours</span> : null}
      </span>
    </div>
  );
});
