/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeApply.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one writer of a custom theme on <html>. Its `--osio-*` map goes on
// <html style>, where an inline property beats every palette and accent
// selector; the light/dark and palette it pins go through theme.ts. The map is
// also cached for index.html, which writes it before first paint.
// readCompiledTheme filters that cache the way index.html does, so a tampered
// cache cannot do more than the app itself could.

import { isSafeTokenValue } from "../../../scripts/bridge-theme-rules.mjs";

import { isThemesEnabled } from "./featureFlags";
import { PALETTES, setThemeOverrides } from "./theme";
import type { CompiledTheme } from "./themeDoc";

export const THEME_VARS_KEY = "osionos:theme-vars";
const VAR_NAME = /^--osio-[a-z0-9-]{1,48}$/;

/** The properties this module wrote, so the next theme can remove what it no longer sets. */
let applied: Record<string, string> = {};

/** Writes only the properties whose value changes and removes the ones `theme` drops; null removes them all. */
export function applyCompiledTheme(theme: CompiledTheme | null) {
  if (typeof document === "undefined") return;
  const { style } = document.documentElement;
  const next = theme?.vars ?? {};
  for (const name of Object.keys(applied)) {
    if (!Object.hasOwn(next, name)) style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(next)) {
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  }
  applied = { ...next };
  setThemeOverrides(theme ? { base: theme.base, palette: theme.palette } : null);
}

export function persistCompiledTheme(theme: CompiledTheme | null) {
  try {
    if (theme) globalThis.localStorage.setItem(THEME_VARS_KEY, JSON.stringify({ v: 1, ...theme }));
    else globalThis.localStorage.removeItem(THEME_VARS_KEY);
  } catch {
    // Blocked or full storage: the theme still applies for this visit, only the next first paint misses it.
  }
}

/** The cached theme with every property and axis the app could not have written dropped; null when absent or unreadable. */
export function readCompiledTheme(): CompiledTheme | null {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(THEME_VARS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const cache = raw as { v?: unknown; base?: unknown; palette?: unknown; vars?: unknown };
    if (cache.v !== 1 || !cache.vars || typeof cache.vars !== "object") return null;
    const vars: Record<string, string> = {};
    for (const [name, value] of Object.entries(cache.vars)) {
      if (VAR_NAME.test(name) && isSafeTokenValue(value)) vars[name] = value as string;
    }
    const base = cache.base === "light" || cache.base === "dark" ? cache.base : undefined;
    const palette = PALETTES.some((entry) => entry.id === cache.palette) ? (cache.palette as string) : undefined;
    return { ...(base ? { base } : {}), ...(palette ? { palette } : {}), vars };
  } catch {
    return null;
  }
}

/** `?theme=safe`: this visit shows the built-in look, whatever theme is stored. */
export function isThemeSafeMode(): boolean {
  return /[?&]theme=safe(?:&|$)/.test(globalThis.location?.search ?? "");
}

/** The boot pass (App mount): applies the cached theme, or removes what index.html wrote when themes are off or the visit is in safe mode. */
export function applyStoredTheme() {
  const cached = readCompiledTheme();
  // index.html wrote these before this module loaded; counting them as applied lets the null case remove them.
  if (cached) applied = { ...cached.vars, ...applied };
  applyCompiledTheme(isThemesEnabled() && !isThemeSafeMode() ? cached : null);
}
