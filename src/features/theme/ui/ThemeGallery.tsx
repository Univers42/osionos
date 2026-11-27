import React, { useCallback, useMemo, useRef, useState } from 'react';

import type { ThemeDoc } from '@/shared/config/themeDoc';
import { isShippedThemeName, SHIPPED_THEMES } from '@/shared/config/themes';
import { useThemeLibrary } from '../model/useThemeLibrary';
import { Segmented } from './Segmented';
import { ThemeActions } from './ThemeActions';
import { ThemeCard } from './ThemeCard';

type Filter = 'all' | 'light' | 'dark' | 'yours';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'yours', label: 'Yours' },
];

const BUILT_IN = 'Built-in';

const matches = (filter: Filter, doc: ThemeDoc): boolean => {
  if (filter === 'all') return true;
  if (filter === 'yours') return !isShippedThemeName(doc.name);
  return doc.base === filter;
};

/** The index a key moves to inside `count` cards, wrapping; -1 for a key that does not move. */
function targetIndex(key: string, from: number, count: number): number {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (from + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (from - 1 + count) % count;
  if (key === 'Home') return 0;
  return key === 'End' ? count - 1 : -1;
}

/**
 * The theme gallery: a filterable radio grid of cards (Built-in first, then shipped, then the
 * person's own) with roving focus, and the actions for the selected theme underneath.
 */
export const ThemeGallery: React.FC<{ mode: 'light' | 'dark' | 'system' }> = ({ mode }) => {
  const themes = useThemeLibrary((state) => state.themes);
  const activeTheme = useThemeLibrary((state) => state.activeTheme);
  const setActiveTheme = useThemeLibrary((state) => state.setActiveTheme);
  const [filter, setFilter] = useState<Filter>('all');
  const group = useRef<HTMLDivElement>(null);

  const all = useMemo(
    () => [...SHIPPED_THEMES, ...Object.values(themes).sort((first, second) => first.name.localeCompare(second.name))],
    [themes],
  );
  const shown = useMemo(() => all.filter((doc) => matches(filter, doc)), [all, filter]);
  const active = useMemo(() => all.find((doc) => doc.name === activeTheme) ?? null, [all, activeTheme]);
  const showBuiltIn = filter === 'all';
  const names = useMemo(() => [...(showBuiltIn ? [null] : []), ...shown.map((doc) => doc.name)], [showBuiltIn, shown]);
  const checkedName = active ? active.name : null;
  const focusable = names.includes(checkedName) ? checkedName : names[0];

  const select = useCallback((name: string | null) => setActiveTheme(name), [setActiveTheme]);

  /** Arrow/Home/End move the selection and the focus together, as a radio group does. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const cards = Array.from(group.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const next = targetIndex(event.key, cards.indexOf(document.activeElement as HTMLElement), cards.length);
    if (next < 0 || cards.length === 0) return;
    event.preventDefault();
    const name = names[next];
    select(name);
    cards[next].focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--osio-fg-default)]">Show</span>
        <Segmented label="Show" value={filter} options={FILTERS} onChange={setFilter} />
      </div>
      <div
        ref={group}
        role="radiogroup"
        aria-label="Theme"
        onKeyDown={onKeyDown}
        className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2"
      >
        {showBuiltIn ? (
          <ThemeCard name={BUILT_IN} doc={null} own={false} checked={checkedName === null} tabIndex={focusable === null ? 0 : -1} onSelect={select} />
        ) : null}
        {shown.map((doc) => (
          <ThemeCard
            key={doc.name}
            name={doc.name}
            doc={doc}
            own={!isShippedThemeName(doc.name)}
            checked={checkedName === doc.name}
            tabIndex={focusable === doc.name ? 0 : -1}
            onSelect={select}
          />
        ))}
      </div>
      {shown.length === 0 && !showBuiltIn ? <p className="text-sm text-[var(--osio-fg-muted)]">No themes here yet.</p> : null}
      <ThemeActions active={active} mode={mode} themes={themes} />
    </div>
  );
};
