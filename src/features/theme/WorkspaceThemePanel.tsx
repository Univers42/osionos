/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceThemePanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 13:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Theme rows for Settings > Preferences: a live preview, the light/dark mode, the grid of
 * named color palettes (Warm, Nord, Monochrome, …) and the theme library. The palette drives
 * the global `data-palette` axis (theme.ts), orthogonal to light/dark, so a theme is one click.
 */

import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { DEFAULT_PALETTE, isThemeBasePinned, PALETTES, type ThemeMode } from '@/shared/config/theme';
import { useThemeLibrary, resolveTheme } from './model/useThemeLibrary';
import type { ThemeSelection } from './model/useThemeSelection';
import { AppearanceRow } from './ui/AppearanceRow';
import { ThemeLibraryControls } from './ui/ThemeLibraryControls';
import { ThemePreview } from './ui/ThemePreview';

const MODES: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
];

/** A small window-chrome mock painted in the palette's own colors. */
const PalettePreview: React.FC<{ swatches: readonly string[] }> = ({ swatches }) => {
  const [bg, surface, accent, ink] = swatches;
  return (
    <div className="flex h-14 w-full overflow-hidden rounded-md" style={{ background: bg }}>
      <div className="flex w-7 flex-col gap-1 p-1.5" style={{ borderRight: `1px solid ${surface}` }}>
        <span className="h-1.5 w-full rounded-full" style={{ background: accent }} />
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: ink, opacity: 0.35 }} />
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: ink, opacity: 0.2 }} />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1.5 p-2">
        <div className="rounded-sm px-1.5 py-1" style={{ background: surface }}>
          <span className="block h-1.5 w-2/3 rounded-full" style={{ background: ink, opacity: 0.7 }} />
        </div>
        <span className="h-3 w-8 rounded-full" style={{ background: accent }} />
      </div>
    </div>
  );
};

const ModeControl: React.FC<{ mode: ThemeMode; disabled: boolean; onSelect: (next: ThemeMode) => void }> = ({ mode, disabled, onSelect }) => (
  <div role="group" aria-label="Mode" className="inline-flex rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-0.5">
    {MODES.map(({ id, label, Icon }) => (
      <button
        key={id}
        type="button"
        aria-pressed={mode === id}
        disabled={disabled}
        onClick={() => onSelect(id)}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-(--osio-dur-fast) ${
          mode === id
            ? 'bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-sm)]'
            : 'text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]'
        }`}
      >
        <Icon size={14} aria-hidden="true" /> {label}
      </button>
    ))}
  </div>
);

const PaletteGrid: React.FC<{ palette: string; onSelect: (id: string) => void }> = ({ palette, onSelect }) => (
  <div className="grid gap-2.5 sm:grid-cols-2">
    {PALETTES.map((preset) => (
      <button
        type="button"
        key={preset.id}
        aria-pressed={palette === preset.id}
        onClick={() => onSelect(preset.id)}
        className={`group rounded-xl border p-2 text-left transition-all duration-(--osio-dur-fast) ${
          palette === preset.id
            ? 'border-[var(--osio-accent)] ring-2 ring-[var(--osio-accent)] ring-offset-1 ring-offset-[var(--osio-bg-surface)]'
            : 'border-[var(--osio-border-default)] hover:border-[var(--osio-border-strong)]'
        }`}
      >
        <PalettePreview swatches={preset.swatches} />
        <div className="mt-2 px-0.5">
          <span className="block text-sm font-semibold text-[var(--osio-fg-default)]">{preset.label}</span>
          <span className="mt-0.5 block text-xs leading-snug text-[var(--osio-fg-muted)]">{preset.description}</span>
        </div>
      </button>
    ))}
  </div>
);

/** Preview, Mode, Color theme and the theme library, driven by the shared theme selection. */
export const ThemeSettings: React.FC<{ theme: ThemeSelection }> = ({ theme }) => {
  const activeThemeName = useThemeLibrary((s) => s.activeTheme);
  const activeThemeDoc = activeThemeName ? resolveTheme(activeThemeName) : null;
  // Caveat: the theme document is read as well as the runtime pin (theme.ts
  // isThemeBasePinned) so this panel re-renders when the theme changes; for the
  // moment between choosing a theme and themeApply pinning it, this panel says
  // "Set by" while the top bar's ':' rows do not yet.
  const pinnedBase = Boolean(activeThemeDoc?.base) || isThemeBasePinned();
  const pinnedPalette = Boolean(activeThemeDoc?.palette);
  return (
    <>
      <ThemePreview />
      <AppearanceRow
        title="Mode"
        description="Light, dark, or follow your system."
        changed={theme.mode !== 'system'}
        onReset={() => theme.selectMode('system')}
      >
        <ModeControl mode={theme.mode} disabled={pinnedBase} onSelect={theme.selectMode} />
      </AppearanceRow>
      {pinnedBase ? <p className="pb-2 text-xs text-[var(--osio-fg-muted)]">Set by {activeThemeName}</p> : null}
      <AppearanceRow
        title="Color theme"
        description="The palette behind every surface and text color."
        changed={theme.palette !== DEFAULT_PALETTE}
        onReset={() => theme.selectPalette(DEFAULT_PALETTE)}
        stack
      >
        {pinnedPalette ? <p className="mb-2 text-xs text-[var(--osio-fg-muted)]">Set by {activeThemeName}</p> : null}
        <PaletteGrid palette={theme.palette} onSelect={theme.selectPalette} />
      </AppearanceRow>
      <div className="border-t border-[var(--osio-border-default)] py-3 empty:hidden">
        <ThemeLibraryControls mode={theme.mode} />
      </div>
    </>
  );
};

export const WorkspaceThemePanel: React.FC = () => {
  return null;
};
