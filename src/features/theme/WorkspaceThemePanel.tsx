import React, { useMemo, useState } from 'react';

import { useUserStore } from '@/features/auth';
import {
  applyWorkspaceAppearance,
  clearWorkspaceAppearance,
  effectiveWorkspaceAppearance,
  resolveWorkspaceConfig,
  THEME_PRESETS,
  useWorkspaceConfigStore,
  type WorkspaceAppearance,
  workspaceConfigKey,
} from '@/shared/config/workspaceConfigStore';

interface WorkspaceThemeControlsProps {
  compact?: boolean;
}

export const WorkspaceThemeControls: React.FC<WorkspaceThemeControlsProps> = ({ compact = false }) => {
  const [themeJson, setThemeJson] = useState('');
  const activeUserId = useUserStore((s) => s.activeUserId);
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const workspaceId = activeWorkspace?._id ?? '';
  const key = workspaceConfigKey(activeUserId || 'anonymous', workspaceId || 'workspace');
  const storedConfig = useWorkspaceConfigStore((s) => s.configs[key]);
  const config = useMemo(() => resolveWorkspaceConfig(storedConfig), [storedConfig]);
  const updateAppearance = useWorkspaceConfigStore((s) => s.updateAppearance);
  const clearAppearance = useWorkspaceConfigStore((s) => s.clearAppearance);
  const effectiveAppearance = effectiveWorkspaceAppearance(config);
  const usingNativeAppTheme = config.appearance == null;

  const applyPreset = async (preset: (typeof THEME_PRESETS)[number]) => {
    if (!activeUserId || !workspaceId) return;
    applyWorkspaceAppearance(preset);
    await updateAppearance(activeUserId, workspaceId, preset);
  };

  const resetToAppTheme = async () => {
    if (!activeUserId || !workspaceId) return;
    clearWorkspaceAppearance();
    await clearAppearance(activeUserId, workspaceId);
  };

  const copyThemeJson = async () => {
    const payload = JSON.stringify(effectiveAppearance, null, 2);
    setThemeJson(payload);
    await navigator.clipboard?.writeText(payload);
  };

  const applyJsonTheme = async () => {
    if (!activeUserId || !workspaceId) return;
    try {
      const parsed = JSON.parse(themeJson) as { themeName?: string; tokens?: Record<string, string> };
      const tokens = parsed.tokens ?? {};
      const required = ['ink', 'muted', 'surface', 'surfaceSecondary', 'surfaceHover', 'accent', 'line'];
      if (!parsed.themeName || required.some((name) => typeof tokens[name] !== 'string')) return;
      const appearance: WorkspaceAppearance = {
        themeName: parsed.themeName,
        tokens: {
          ink: tokens.ink,
          muted: tokens.muted,
          surface: tokens.surface,
          surfaceSecondary: tokens.surfaceSecondary,
          surfaceHover: tokens.surfaceHover,
          accent: tokens.accent,
          line: tokens.line,
        },
      };
      applyWorkspaceAppearance(appearance);
      await updateAppearance(activeUserId, workspaceId, appearance);
    } catch {
      // Invalid JSON is ignored; the textarea stays editable.
    }
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3 overflow-y-auto p-4'}>
      <button
        type="button"
        className={`w-full rounded-xl border p-3 text-left transition ${
          usingNativeAppTheme
            ? 'border-[var(--color-accent)] bg-[var(--color-surface-secondary)]'
            : 'border-[var(--color-line)] hover:bg-[var(--color-surface-hover)]'
        }`}
        onClick={() => void resetToAppTheme()}
      >
        <span className="text-sm font-medium text-[var(--color-ink)]">App light/dark/system</span>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          Clears workspace token overrides so the native app theme works again.
        </p>
      </button>

      <div className="grid gap-2 sm:grid-cols-2">
        {THEME_PRESETS.map((preset) => {
          const selected = config.appearance?.themeName === preset.themeName;
          return (
            <button
              type="button"
              key={preset.themeName}
              className={`rounded-xl border p-3 text-left transition ${
                selected
                  ? 'border-[var(--color-accent)] bg-[var(--color-surface-secondary)]'
                  : 'border-[var(--color-line)] hover:bg-[var(--color-surface-hover)]'
              }`}
              onClick={() => void applyPreset(preset)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--color-ink)]">{preset.themeName}</span>
                <span className="flex gap-1">
                  {Object.values(preset.tokens).slice(0, 4).map((color, index) => (
                    <span
                      key={`${preset.themeName}-${index}`}
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-[var(--color-line)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[var(--color-ink)]">JSON theme config</span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
            onClick={() => void copyThemeJson()}
          >
            Copy current
          </button>
        </div>
        <textarea
          className="h-32 w-full resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-secondary)] p-2 font-mono text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          placeholder='{"themeName":"Custom","tokens":{"ink":"#...","muted":"#...","surface":"#...","surfaceSecondary":"#...","surfaceHover":"#...","accent":"#...","line":"#..."}}'
          value={themeJson}
          onChange={(event) => setThemeJson(event.target.value)}
        />
        <button
          type="button"
          className="mt-2 w-full rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          onClick={() => void applyJsonTheme()}
        >
          Apply JSON tokens
        </button>
      </div>
    </div>
  );
};

export const WorkspaceThemePanel: React.FC = () => {
  return null;
};
