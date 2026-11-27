import { useSyncExternalStore } from 'react';

import {
  DEFAULT_PALETTE,
  readCurrentPalette,
  readCurrentThemeMode,
  setThemeMode,
  subscribeThemeChoice,
  type ThemeMode,
} from '@/shared/config/theme';
import { choosePalette } from './choosePalette';

export interface ThemeSelection {
  mode: ThemeMode;
  palette: string;
  selectMode: (next: ThemeMode) => void;
  selectPalette: (id: string) => void;
}

const selectPalette = (id: string) => choosePalette(id || DEFAULT_PALETTE);

/**
 * The chosen light/dark mode and colour theme, with the two ways to change them. Read live,
 * not copied at mount: the top bar's ':' mode changes them too, and Settings must show it.
 * Settings holds one of these so that the theme rows and the "Reset appearance" action read
 * the same state.
 */
export function useThemeSelection(): ThemeSelection {
  const mode = useSyncExternalStore(subscribeThemeChoice, readCurrentThemeMode, readCurrentThemeMode);
  const palette = useSyncExternalStore(subscribeThemeChoice, readCurrentPalette, readCurrentPalette);
  return { mode, palette, selectMode: setThemeMode, selectPalette };
}
