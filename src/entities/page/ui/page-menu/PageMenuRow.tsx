import React from 'react';
import { Check } from 'lucide-react';

import type { PageMenuItem } from './types';

/** Notion-sized row: 28–32px tall depending on the density tokens. */
export const MENU_ROW_STYLE: React.CSSProperties = { height: 'var(--osio-control-h-md)' };

export const PageMenuRow: React.FC<{ item: PageMenuItem }> = ({ item }) => (
  <button
    type="button"
    data-testid={item.testId}
    data-tone={item.danger ? 'danger' : undefined}
    onClick={item.run}
    aria-pressed={item.toggle ? Boolean(item.checked) : undefined}
    className="osio-menu-item"
    style={MENU_ROW_STYLE}
  >
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--osio-fg-muted)]">{item.icon}</span>
    <span className="min-w-0 flex-1 truncate">{item.label}</span>
    {item.badge && (
      <span className="rounded-full bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)]">{item.badge}</span>
    )}
    {item.shortcut && <span className="text-xs text-[var(--osio-fg-subtle)]">{item.shortcut}</span>}
    {item.hint && <span className="max-w-20 truncate text-xs text-[var(--osio-fg-subtle)]">{item.hint}</span>}
    {item.toggle ? <MenuSwitch on={Boolean(item.checked)} /> : item.checked && <Check size={14} className="shrink-0 text-[var(--osio-accent)]" />}
  </button>
);

const MenuSwitch: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    aria-hidden
    className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--osio-accent)]' : 'bg-[var(--osio-border-strong)]'}`}
  >
    <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--osio-bg-surface)] transition-[left] ${on ? 'left-3' : 'left-0.5'}`} />
  </span>
);
