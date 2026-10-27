/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThemeLibraryControls.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { isThemesEnabled } from "@/shared/config/featureFlags";
import { openThemeJson } from "@/features/theme-editor/model/openThemeJson";
import { themeSlug } from "../../../../scripts/bridge-theme-rules.mjs";
import { useThemeLibrary, listThemes } from "@/features/theme/model/useThemeLibrary";

export const ThemeLibraryControls: React.FC = () => {
  const activeTheme = useThemeLibrary((state) => state.activeTheme);
  const setActiveTheme = useThemeLibrary((state) => state.setActiveTheme);
  if (!isThemesEnabled()) return null;
  const themes = listThemes();

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setActiveTheme(value === "built-in" ? null : value);
  };

  const handleAdvanced = () => {
    if (activeTheme) {
      openThemeJson({ kind: "theme", slug: themeSlug(activeTheme) });
    } else {
      openThemeJson({ kind: "new-theme" });
    }
  };

  const handleReset = () => {
    setActiveTheme(null);
  };

  return (
    <div data-settings-anchor="theme-json" className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--osio-fg-default)]" htmlFor="theme-library-select">Theme</label>
        <select id="theme-library-select" value={activeTheme ?? "built-in"} onChange={handleThemeChange} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm text-[var(--osio-fg-default)]">
          <option value="built-in">Built-in</option>
          {themes.map((theme) => (
            <option key={theme.name} value={theme.name}>{theme.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleAdvanced} className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-default)]">Advanced (JSON)</button>
        <button type="button" onClick={handleReset} className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-default)]">Reset theme</button>
      </div>
    </div>
  );
};
