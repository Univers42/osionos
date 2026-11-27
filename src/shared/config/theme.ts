/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:34 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { noticingWriter } from '@/shared/lib/storage-full/noticingWrite';
import { CUSTOM_ACCENT, DEFAULT_APPEARANCE, parseAppearance } from "./appearance";
import type { Appearance } from "./appearance";
import { GENERATED_PALETTES } from "./palettes.generated";

export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "osionos:theme-mode";

const OS_DARK = "(prefers-color-scheme: dark)";

function osTheme(): "light" | "dark" {
  return globalThis.matchMedia(OS_DARK).matches ? "dark" : "light";
}

/** What the active custom theme pins (themeApply.ts sets it): a theme with a
 *  `base` decides light or dark, one with a `palette` decides the palette, and
 *  the stored preferences come back when it goes. */
export interface ThemeOverrides {
  base?: "light" | "dark";
  palette?: string;
}

let overrides: ThemeOverrides | null = null;

export function setThemeOverrides(next: ThemeOverrides | null) {
  overrides = next?.base || next?.palette ? { ...next } : null;
  applyTheme(readCurrentThemeMode());
  applyPalette(readCurrentPalette());
}

export function isThemeBasePinned(): boolean {
  return Boolean(overrides?.base);
}

export function isThemePalettePinned(): boolean {
  return Boolean(overrides?.palette);
}

/** Who shows the chosen mode or palette (Settings, the top bar) re-reads it on
 *  this signal, so a change made on one surface is not undone by a stale copy
 *  on another. Returns the unsubscribe. */
const themeChoiceListeners = new Set<() => void>();

export function subscribeThemeChoice(listener: () => void): () => void {
  themeChoiceListeners.add(listener);
  return () => {
    themeChoiceListeners.delete(listener);
  };
}

function notifyThemeChoice() {
  for (const listener of themeChoiceListeners) listener();
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = overrides?.base ?? (mode === "system" ? osTheme() : mode);
}

/** Keeps "system" mode in step with the OS while the app is open (a laptop
 *  that turns dark at sunset). This module is the only writer of
 *  <html data-theme>. Returns the unsubscribe. */
export function watchSystemTheme(): () => void {
  if (globalThis.window === undefined) return () => undefined;
  const query = globalThis.matchMedia(OS_DARK);
  const follow = () => {
    if (readCurrentThemeMode() === "system") applyTheme("system");
  };
  query.addEventListener("change", follow);
  return () => query.removeEventListener("change", follow);
}

/** The quick light/dark flip. Landing back on the OS's own theme stores
 *  "system" rather than pinning it, so the app goes on following the OS; a
 *  permanent choice is made in Settings. While a theme pins the base it does
 *  nothing and returns the stored mode (the caller says why). */
export function toggleThemeMode(): ThemeMode {
  if (isThemeBasePinned()) return readCurrentThemeMode();
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  const mode: ThemeMode = next === osTheme() ? "system" : next;
  setThemeMode(mode);
  return mode;
}

function readStoredThemeMode(): ThemeMode {
  if (globalThis.window === undefined) return "system";
  const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

/** The mode and palette this tab chose. Storage is read once; after that the
 *  value set here wins, because a write that a full storage refuses
 *  (noticingWrite) leaves the new choice on screen but not on disk, and every
 *  surface that shows the choice must show what is on screen. */
let chosenThemeMode: ThemeMode | null = null;
let chosenPalette: string | null = null;

export function readCurrentThemeMode(): ThemeMode {
  chosenThemeMode ??= readStoredThemeMode();
  return chosenThemeMode;
}

const writeTheme = noticingWriter('Theme');

export function persistThemeMode(mode: ThemeMode) {
  chosenThemeMode = mode;
  writeTheme(THEME_STORAGE_KEY, mode);
  notifyThemeChoice();
}

/** Light, dark or follow the OS, shown and kept. A theme that pins the base still wins on screen. */
export function setThemeMode(mode: ThemeMode) {
  applyTheme(mode);
  persistThemeMode(mode);
}

/* ── Palette (color scheme) — orthogonal to light/dark ──────────────────────
 * The `data-palette` axis selects a named color scheme (Warm, Nord, …); the
 * `data-theme` axis (above) selects light/dark within it. Every palette ships
 * both modes. The default palette keeps the id "warm" because that id is stored
 * in users' browsers; it is shown as "Calm". Its colours are generated into
 * tokens.generated.css on `:root`/[data-theme] with no data-palette block; every
 * other palette has a complete block per mode there. */

export interface PaletteMeta {
  /** matches `[data-palette="<id>"]` in tokens.generated.css; "warm" is the default palette. */
  id: string;
  label: string;
  description: string;
  /** the mode the picker card previews (a theme's most flattering face). */
  signatureMode: "light" | "dark";
  /** [bgCanvas, bgSurface, accent, update, fgDefault] for the picker swatch card. */
  swatches: readonly string[];
}

/** Every palette, default first, generated with its CSS by scripts/build-tokens.mjs. */
export const PALETTES: readonly PaletteMeta[] = GENERATED_PALETTES;

export const DEFAULT_PALETTE = "warm";
const PALETTE_STORAGE_KEY = "osionos:palette";

export function applyPalette(id: string) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.palette = overrides?.palette ?? (id || DEFAULT_PALETTE);
}

function readStoredPalette(): string {
  if (globalThis.window === undefined) return DEFAULT_PALETTE;
  const stored = globalThis.localStorage.getItem(PALETTE_STORAGE_KEY) ?? "";
  return PALETTES.some((p) => p.id === stored) ? stored : DEFAULT_PALETTE;
}

export function readCurrentPalette(): string {
  chosenPalette ??= readStoredPalette();
  return chosenPalette;
}

/** The palette on screen: the active theme's when it pins one, else the chosen one. */
export function readEffectivePalette(): string {
  return overrides?.palette ?? readCurrentPalette();
}

export function persistPalette(id: string) {
  chosenPalette = id;
  writeTheme(PALETTE_STORAGE_KEY, id);
  notifyThemeChoice();
}

export * from "./appearance";

const APPEARANCE_STORAGE_KEY = "osionos:appearance";

/** What a MutationObserver on <html> watches to follow an appearance change: the accent,
 *  density, corner and text-size attributes, and `style`, which carries the custom hue. The
 *  accessibility axes are not in it: none of them changes a colour, and the
 *  editor's theme must not be rebuilt because somebody turned motion off. */
export const APPEARANCE_ATTRIBUTES = ["data-accent", "data-density", "data-radius", "data-ui-scale", "style"] as const;

export function readStoredAppearance(): Appearance {
  if (globalThis.window === undefined) return DEFAULT_APPEARANCE;
  try {
    return parseAppearance(globalThis.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function persistAppearance(appearance: Appearance) {
  writeTheme(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
}

/** The axes that live on <html> as an attribute. urlPaste is not one of them:
 *  it changes what a paste does, not what the document looks like. */
const ATTRIBUTE_AXES = [
  "accent", "density", "radius", "uiScale", "linkUnderline", "motion", "animatedImages", "hovercards",
  "caretColor", "caretShape", "caretBlink", "surface", "elevation", "borders",
  "pageTransition", "overlayTransition", "motionSpeed", "easing", "pressFeedback",
] as const;

/** The appearance as it stands. applyAppearance() keeps it up to date, so a
 *  reader that needs a value with no <html> attribute (urlPaste) sees the live
 *  one instead of a second copy that can drift. It starts from what is
 *  stored, so a reader that asks before the boot pass still sees the
 *  person's choice. */
let currentAppearance: Appearance | null = null;
const appearanceListeners = new Set<() => void>();

export function readCurrentAppearance(): Appearance {
  if (!currentAppearance) currentAppearance = readStoredAppearance();
  return currentAppearance;
}

/** Notified after every applied appearance. Returns the unsubscribe. */
export function subscribeAppearance(listener: () => void): () => void {
  appearanceListeners.add(listener);
  return () => {
    appearanceListeners.delete(listener);
  };
}

/** Writes the appearance to <html>: an attribute per axis, removed at its default, and the one
 *  inline hue only while the accent is custom. */
export function applyAppearance(appearance: Appearance) {
  if (typeof document === "undefined") return;
  const { dataset, style } = document.documentElement;
  for (const name of ATTRIBUTE_AXES) {
    const value = appearance[name];
    if (value === DEFAULT_APPEARANCE[name]) delete dataset[name];
    else dataset[name] = value;
  }
  if (appearance.accent === CUSTOM_ACCENT) style.setProperty("--osio-accent-hue", String(appearance.hue));
  else style.removeProperty("--osio-accent-hue");
  currentAppearance = appearance;
  for (const listener of appearanceListeners) listener();
}

/** Applies one change to the live appearance and stores it. The change is
 *  merged into what is live, not into a caller's copy: two panels that each
 *  hold a snapshot of the appearance must not roll the other's choice back. */
export function updateAppearance(patch: Partial<Appearance>): Appearance {
  const next = { ...readCurrentAppearance(), ...patch };
  applyAppearance(next);
  persistAppearance(next);
  return next;
}

/** Apply every axis at boot from storage (call once on app init). */
export function applyStoredAppearance() {
  applyTheme(readCurrentThemeMode());
  applyPalette(readCurrentPalette());
  applyAppearance(readStoredAppearance());
}
