/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:34 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:24:35 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { GENERATED_PALETTES } from "./palettes.generated";

export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "osionos:theme-mode";

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "system") {
    const prefersDark = globalThis.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.dataset.theme = prefersDark ? "dark" : "light";
    return;
  }
  root.dataset.theme = mode;
}

export function readStoredThemeMode(): ThemeMode {
  if (globalThis.window === undefined) return "system";
  const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function persistThemeMode(mode: ThemeMode) {
  if (globalThis.window === undefined) return;
  globalThis.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

/* ── Palette (color scheme) — orthogonal to light/dark ──────────────────────
 * The `data-palette` axis selects a named color scheme (Warm, Nord, …); the
 * `data-theme` axis (above) selects light/dark within it. Every palette ships
 * both modes. The default "warm" palette has no override block in global.css —
 * it falls through to the base `:root`/[data-theme] tokens — so it stays
 * byte-identical to the original editorial theme. */

export interface PaletteMeta {
  /** matches `[data-palette="<id>"]` in global.css; "warm" = the default base. */
  id: string;
  label: string;
  description: string;
  /** the mode the picker card previews (a theme's most flattering face). */
  signatureMode: "light" | "dark";
  /** [bgPage, bgSurface, accent, update, fgDefault] for the picker swatch card. */
  swatches: readonly string[];
}

export const WARM_PALETTE: PaletteMeta = {
  id: "warm",
  label: "Warm Editorial",
  description: "Cream parchment and terracotta — the signature editorial theme.",
  signatureMode: "light",
  swatches: ["#FAF9F5", "#FFFFFF", "#CC785C", "#2563EB", "#1A1A18"],
};

// The remaining palettes are appended here from the generated registry.
export const PALETTES: readonly PaletteMeta[] = [
  WARM_PALETTE,
  ...GENERATED_PALETTES,
];

export const DEFAULT_PALETTE = "warm";
const PALETTE_STORAGE_KEY = "osionos:palette";

export function applyPalette(id: string) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.palette = id || DEFAULT_PALETTE;
}

export function readStoredPalette(): string {
  if (globalThis.window === undefined) return DEFAULT_PALETTE;
  const stored = globalThis.localStorage.getItem(PALETTE_STORAGE_KEY) ?? "";
  return PALETTES.some((p) => p.id === stored) ? stored : DEFAULT_PALETTE;
}

export function persistPalette(id: string) {
  if (globalThis.window === undefined) return;
  globalThis.localStorage.setItem(PALETTE_STORAGE_KEY, id);
}

/** Apply both axes at boot from storage (call once on app init). */
export function applyStoredAppearance() {
  applyTheme(readStoredThemeMode());
  applyPalette(readStoredPalette());
}

