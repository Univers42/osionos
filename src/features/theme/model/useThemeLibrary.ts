/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useThemeLibrary.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A person's own themes and the active one. Shipped themes are never copied in:
// they are looked up by name in SHIPPED_THEMES, so an update to one reaches
// everybody. Every name is checked by its slug, the key the bridge stores a
// theme under, so two names that differ only in case or punctuation are the
// same name, and no theme takes a shipped theme's name.

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { THEME_LIMITS, themeSlug } from "../../../../scripts/bridge-theme-rules.mjs";

import { applyCompiledTheme, persistCompiledTheme } from "@/shared/config/themeApply";
import { compileTheme, parseThemeDoc, type ThemeDoc } from "@/shared/config/themeDoc";
import { SHIPPED_THEMES } from "@/shared/config/themes";

export type SaveThemeResult = { ok: true } | { ok: false; message: string };

interface ThemeLibraryState {
  /** The person's themes, keyed by slug. */
  themes: Record<string, ThemeDoc>;
  /** The active theme's name, shipped or the person's own; null for the built-in look. */
  activeTheme: string | null;
  setActiveTheme: (name: string | null) => void;
  saveTheme: (doc: ThemeDoc, previousName?: string) => SaveThemeResult;
  /** Removes one of the person's themes and returns it, for Undo; null when there is none by that name. */
  deleteTheme: (name: string) => ThemeDoc | null;
}

const shippedBySlug = (slug: string) => SHIPPED_THEMES.find((theme) => themeSlug(theme.name) === slug) ?? null;

/** The person's own theme that `activeTheme` names, by slug; null when the active theme is shipped or none. */
function ownActiveSlug(activeTheme: string | null): string | null {
  if (activeTheme === null) return null;
  const slug = themeSlug(activeTheme);
  return shippedBySlug(slug) ? null : slug;
}

/** Applies a theme and caches it for the next first paint. A stored doc is parsed again, so a hand-edited localStorage entry keeps only its valid part. */
function activate(doc: ThemeDoc | null) {
  const parsed = doc ? parseThemeDoc(doc).doc : null;
  const compiled = parsed ? compileTheme(parsed) : null;
  applyCompiledTheme(compiled);
  persistCompiledTheme(compiled);
}

export const useThemeLibrary = create<ThemeLibraryState>()(
  persist(
    (set, get) => ({
      themes: {},
      activeTheme: null,
      setActiveTheme: (name) => {
        const doc = resolveTheme(name);
        activate(doc);
        set({ activeTheme: doc?.name ?? null });
      },
      saveTheme: (input, previousName) => {
        const { doc, issues } = parseThemeDoc(input);
        const error = issues.find((issue) => issue.severity === "error");
        if (!doc || error) return { ok: false, message: `${error?.path.join(".") || "theme"}: ${error?.message ?? "not a theme"}` };
        const slug = themeSlug(doc.name);
        if (!slug) return { ok: false, message: "a theme name needs at least one letter or digit" };
        if (shippedBySlug(slug)) return { ok: false, message: `"${doc.name}" is the name of a built-in theme; choose another` };
        const { themes, activeTheme } = get();
        const previousSlug = previousName === undefined ? null : themeSlug(previousName);
        if (slug !== previousSlug && themes[slug]) return { ok: false, message: `a theme named "${themes[slug].name}" already exists` };
        const next = { ...themes };
        if (previousSlug !== null) delete next[previousSlug];
        next[slug] = doc;
        if (Object.keys(next).length > THEME_LIMITS.themes) return { ok: false, message: `at most ${THEME_LIMITS.themes} themes; delete one first` };
        const activeSlug = ownActiveSlug(activeTheme);
        const savesActive = activeSlug !== null && (activeSlug === slug || activeSlug === previousSlug);
        set({ themes: next, ...(savesActive ? { activeTheme: doc.name } : {}) });
        if (savesActive) activate(doc);
        return { ok: true };
      },
      deleteTheme: (name) => {
        const slug = themeSlug(name);
        const { themes, activeTheme } = get();
        const doc = themes[slug];
        if (!doc) return null;
        const next = { ...themes };
        delete next[slug];
        const deletesActive = ownActiveSlug(activeTheme) === slug;
        set({ themes: next, ...(deletesActive ? { activeTheme: null } : {}) });
        if (deletesActive) activate(null);
        return doc;
      },
    }),
    { name: "osionos:theme-library" },
  ),
);

/** A shipped theme or one of the person's, by name in any case; null when neither exists. */
export function resolveTheme(name: string | null): ThemeDoc | null {
  if (name === null) return null;
  const slug = themeSlug(name);
  return shippedBySlug(slug) ?? useThemeLibrary.getState().themes[slug] ?? null;
}

/** Every theme a person can pick: the shipped ones first, then theirs by name. */
export function listThemes(): ThemeDoc[] {
  const own = Object.values(useThemeLibrary.getState().themes).sort((first, second) => first.name.localeCompare(second.name));
  return [...SHIPPED_THEMES, ...own];
}
