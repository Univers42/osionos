/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThemeSafeModeBanner.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { isThemeSafeMode } from "@/shared/config/themeApply";
import { useThemeLibrary } from "@/features/theme/model/useThemeLibrary";

export const ThemeSafeModeBanner: React.FC = () => {
  const setActiveTheme = useThemeLibrary((state) => state.setActiveTheme);
  if (!isThemeSafeMode()) return null;

  const dropParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("theme");
    return url;
  };

  const handleReset = () => {
    setActiveTheme(null);
    const url = dropParam();
    window.history.replaceState({}, "", url.toString());
  };

  const handleTurnOn = () => {
    const url = dropParam();
    window.location.replace(url.toString());
  };

  return (
    <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm text-[var(--osio-fg-default)]">
      <span>Your custom theme is off for this visit.</span>
      <button type="button" onClick={handleReset} className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs">Reset theme</button>
      <button type="button" onClick={handleTurnOn} className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs">Turn it back on</button>
    </div>
  );
};
