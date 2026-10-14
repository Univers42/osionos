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

import { FIXED_ACCENT_PALETTES, GENERATED_ACCENTS } from "./accents.generated";
import { GENERATED_PALETTES } from "./palettes.generated";

export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "osionos:theme-mode";

const OS_DARK = "(prefers-color-scheme: dark)";

function osTheme(): "light" | "dark" {
  return globalThis.matchMedia(OS_DARK).matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode === "system" ? osTheme() : mode;
}

/** Keeps "system" mode in step with the OS while the app is open (a laptop
 *  that turns dark at sunset). This module is the only writer of
 *  <html data-theme>. Returns the unsubscribe. */
export function watchSystemTheme(): () => void {
  if (globalThis.window === undefined) return () => undefined;
  const query = globalThis.matchMedia(OS_DARK);
  const follow = () => {
    if (readStoredThemeMode() === "system") applyTheme("system");
  };
  query.addEventListener("change", follow);
  return () => query.removeEventListener("change", follow);
}

/** The quick light/dark flip. Landing back on the OS's own theme stores
 *  "system" rather than pinning it, so the app goes on following the OS; a
 *  permanent choice is made in Settings. */
export function toggleThemeMode(): ThemeMode {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  const mode: ThemeMode = next === osTheme() ? "system" : next;
  applyTheme(mode);
  persistThemeMode(mode);
  return mode;
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

/* ── Appearance — accent, density, corners, text size ───────────────────────
 * Four more <html> attributes and one number, all stored together under one
 * key. Each sits at its default when absent, so a person who never opens the
 * panel carries no attribute and no stored value. Accent colours are in
 * accents.generated.css, the other three axes in appearance.css. index.html
 * mirrors applyAppearance() before first paint. */

export interface AccentMeta {
  /** matches `[data-accent="<id>"]` in accents.generated.css; "cobalt" is the default and has no block. */
  id: string;
  label: string;
  /** the preset's accent in light mode, for the picker swatch. */
  swatch: string;
}

/** Every accent preset, default first, generated with its CSS by scripts/build-tokens.mjs. */
export const ACCENT_PRESETS: readonly AccentMeta[] = GENERATED_ACCENTS;

/** Palettes whose own accent no preset or custom hue replaces (the AAA palette). */
export { FIXED_ACCENT_PALETTES };

export const CUSTOM_ACCENT = "custom";

export type Density = "comfortable" | "compact";
export type Roundness = "sharp" | "default" | "round";
export type UiScale = "small" | "default" | "large";

export interface Appearance {
  /** a preset id, or "custom" to use `hue`. */
  accent: string;
  /** the custom accent's hue in whole degrees, 0..359. */
  hue: number;
  density: Density;
  radius: Roundness;
  uiScale: UiScale;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: ACCENT_PRESETS[0].id,
  hue: 260,
  density: "comfortable",
  radius: "default",
  uiScale: "default",
};

const APPEARANCE_STORAGE_KEY = "osionos:appearance";

/** What a MutationObserver on <html> watches to follow an appearance change: the three
 *  attributes, the accent, and `style`, which carries the custom hue. */
export const APPEARANCE_ATTRIBUTES = ["data-accent", "data-density", "data-radius", "data-ui-scale", "style"] as const;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

function parseHue(value: unknown): number {
  const hue = typeof value === "number" ? Math.round(value) + 0 : Number.NaN;
  return hue >= 0 && hue <= 359 ? hue : DEFAULT_APPEARANCE.hue;
}

/** A stored appearance, each field checked on its own: whatever is unknown, out of range or
 *  malformed falls back to that field's default, so a corrupt value never reaches the DOM. */
export function parseAppearance(raw: string | null): Appearance {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    // Unparseable storage is the same as none: the defaults below.
  }
  const accents = [...ACCENT_PRESETS.map((preset) => preset.id), CUSTOM_ACCENT];
  return {
    accent: oneOf(stored.accent, accents, DEFAULT_APPEARANCE.accent),
    hue: parseHue(stored.hue),
    density: oneOf(stored.density, ["comfortable", "compact"], DEFAULT_APPEARANCE.density),
    radius: oneOf(stored.radius, ["sharp", "default", "round"], DEFAULT_APPEARANCE.radius),
    uiScale: oneOf(stored.uiScale, ["small", "default", "large"], DEFAULT_APPEARANCE.uiScale),
  };
}

export function readStoredAppearance(): Appearance {
  if (globalThis.window === undefined) return DEFAULT_APPEARANCE;
  try {
    return parseAppearance(globalThis.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function persistAppearance(appearance: Appearance) {
  if (globalThis.window === undefined) return;
  globalThis.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
}

/** Writes the appearance to <html>: an attribute per axis, removed at its default, and the one
 *  inline hue only while the accent is custom. */
export function applyAppearance(appearance: Appearance) {
  if (typeof document === "undefined") return;
  const { dataset, style } = document.documentElement;
  const axis = (name: "accent" | "density" | "radius" | "uiScale", value: string) => {
    if (value === DEFAULT_APPEARANCE[name]) delete dataset[name];
    else dataset[name] = value;
  };
  axis("accent", appearance.accent);
  axis("density", appearance.density);
  axis("radius", appearance.radius);
  axis("uiScale", appearance.uiScale);
  if (appearance.accent === CUSTOM_ACCENT) style.setProperty("--osio-accent-hue", String(appearance.hue));
  else style.removeProperty("--osio-accent-hue");
}

/** Apply every axis at boot from storage (call once on app init). */
export function applyStoredAppearance() {
  applyTheme(readStoredThemeMode());
  applyPalette(readStoredPalette());
  applyAppearance(readStoredAppearance());
}
