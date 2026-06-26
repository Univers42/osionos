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
 * Appearance controls: a light/dark/system mode toggle + a grid of named color
 * palettes (Warm, Nord, Monochrome, …). The palette drives the global
 * `data-palette` axis (theme.ts) — orthogonal to light/dark — so a theme is one
 * click and re-skins the whole app. Picking a palette also clears any legacy
 * per-workspace token override so the chosen palette is what actually shows.
 */

import React, { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import {
  applyPalette,
  applyTheme,
  PALETTES,
  persistPalette,
  persistThemeMode,
  readStoredPalette,
  readStoredThemeMode,
  type ThemeMode,
} from '@/shared/config/theme';
import {
  clearWorkspaceAppearance,
  useWorkspaceConfigStore,
} from '@/shared/config/workspaceConfigStore';

interface WorkspaceThemeControlsProps {
  compact?: boolean;
}

const MODES: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
];

/** A small window-chrome mock painted in the palette's own colors. */
const PalettePreview: React.FC<{ swatches: readonly string[] }> = ({ swatches }) => {
  const [bg, surface, accent, update, ink] = swatches;
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
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-8 rounded-full" style={{ background: accent }} />
          <span className="h-3 w-3 rounded-full" style={{ background: update }} />
        </div>
      </div>
    </div>
  );
};

export const WorkspaceThemeControls: React.FC<WorkspaceThemeControlsProps> = ({ compact = false }) => {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [palette, setPalette] = useState<string>(() => readStoredPalette());
  const activeUserId = useUserStore((s) => s.activeUserId);
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const clearAppearance = useWorkspaceConfigStore((s) => s.clearAppearance);

  const selectMode = (next: ThemeMode) => {
    applyTheme(next);
    persistThemeMode(next);
    setMode(next);
  };

  const selectPalette = (id: string) => {
    applyPalette(id);
    persistPalette(id);
    setPalette(id);
    // A per-workspace inline override would mask the palette — drop it so the
    // chosen palette is what the user actually sees.
    clearWorkspaceAppearance();
    const workspaceId = activeWorkspace?._id;
    if (activeUserId && workspaceId) void clearAppearance(activeUserId, workspaceId).catch(() => {});
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 overflow-y-auto p-4'}>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">Mode</p>
        <div className="inline-flex rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-0.5">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => selectMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-[120ms] ${
                mode === id
                  ? 'bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-[var(--osio-shadow-sm)]'
                  : 'text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">Color theme</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PALETTES.map((preset) => {
            const selected = palette === preset.id;
            return (
              <button
                type="button"
                key={preset.id}
                aria-pressed={selected}
                onClick={() => selectPalette(preset.id)}
                className={`group rounded-xl border p-2 text-left transition-all duration-[140ms] ${
                  selected
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
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const WorkspaceThemePanel: React.FC = () => {
  return null;
};
