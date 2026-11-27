import { useState } from 'react';

import { useUserStore } from '@/features/auth';
import {
  applyPalette,
  applyTheme,
  DEFAULT_PALETTE,
  persistPalette,
  persistThemeMode,
  readStoredPalette,
  readStoredThemeMode,
  type ThemeMode,
} from '@/shared/config/theme';
import { useWorkspaceConfigStore } from '@/shared/config/workspaceConfigStore';

export interface ThemeSelection {
  mode: ThemeMode;
  palette: string;
  selectMode: (next: ThemeMode) => void;
  selectPalette: (id: string) => void;
}

/**
 * The stored light/dark mode and colour theme, with the two ways to change them. Picking a
 * palette also clears any per-workspace appearance still stored from before palettes existed,
 * so the chosen palette is what actually shows. Settings holds one of these so that the
 * theme rows and the "Reset appearance" action read the same state.
 */
export function useThemeSelection(): ThemeSelection {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [palette, setPalette] = useState<string>(() => readStoredPalette());
  const activeUserId = useUserStore((state) => state.activeUserId);
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const clearAppearance = useWorkspaceConfigStore((state) => state.clearAppearance);

  const selectMode = (next: ThemeMode) => {
    applyTheme(next);
    persistThemeMode(next);
    setMode(next);
  };

  const selectPalette = (id: string) => {
    applyPalette(id || DEFAULT_PALETTE);
    persistPalette(id || DEFAULT_PALETTE);
    setPalette(id || DEFAULT_PALETTE);
    const workspaceId = activeWorkspace?._id;
    if (activeUserId && workspaceId) void clearAppearance(activeUserId, workspaceId).catch(() => {});
  };

  return { mode, palette, selectMode, selectPalette };
}
