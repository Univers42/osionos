/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineSettings.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The settings the top bar's ':' mode changes in place. Each one applies and
// persists through the same function its Settings panel calls, so a value set
// from the bar is the value Settings shows.
//
// The list is closed on purpose: only device-local presentation preferences.
// Nothing here touches the server, an account, a session, sharing or access —
// those stay behind their panels, where the context and the confirmation are.

import { choosePalette } from "@/features/theme/model/choosePalette";
import { APPEARANCE_CHOICES, type ChoiceAxis } from "@/shared/config/appearanceChoices";
import { activeStyleId, STYLE_PRESETS } from "@/shared/config/stylePresets";
import {
  ACCENT_PRESETS,
  FIXED_ACCENT_PALETTES,
  isThemeBasePinned,
  isThemePalettePinned,
  PALETTES,
  readCurrentAppearance,
  readCurrentPalette,
  readEffectivePalette,
  readCurrentThemeMode,
  setThemeMode,
  updateAppearance,
  type Appearance,
  type ThemeMode,
} from "@/shared/config/theme";
import { useUIStore } from "@/shared/config/uiStore";
import type { InlineSetting, InlineSettingBlock } from "@/widgets/top-bar/model/settingRows";

import { openSettings } from "./settingsNav";

const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const openAppearance = () => openSettings("preferences", "appearance");
const setByTheme = (pinned: () => boolean) => (): InlineSettingBlock | null =>
  pinned() ? { reason: "Set by your theme", open: openAppearance } : null;

/** One appearance axis as a setting; the id is the axis name. */
function axisSetting<K extends ChoiceAxis>(axis: K, keywords: string[] = []): InlineSetting {
  const choices = APPEARANCE_CHOICES[axis];
  return {
    id: axis,
    label: choices.label,
    keywords,
    options: choices.options,
    current: () => readCurrentAppearance()[axis],
    apply: (value) => updateAppearance({ [axis]: value } as Partial<Appearance>),
  };
}

/** The ':' settings, in the order they are listed when nothing is typed yet. */
export function inlineSettings(): InlineSetting[] {
  return [
    {
      id: "theme", label: "Theme", keywords: ["mode", "light", "dark", "appearance"],
      options: THEME_MODES,
      current: readCurrentThemeMode,
      apply: (value) => setThemeMode(value as ThemeMode),
      blocked: setByTheme(isThemeBasePinned),
    },
    {
      id: "palette", label: "Color scheme", keywords: ["palette", "theme", "colors"],
      options: PALETTES.map((palette) => ({ value: palette.id, label: palette.label })),
      current: readCurrentPalette,
      apply: choosePalette,
      blocked: setByTheme(isThemePalettePinned),
    },
    {
      id: "style", label: "Style", keywords: ["look", "preset"],
      options: STYLE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
      current: () => activeStyleId(readCurrentAppearance()) ?? "",
      apply: (value) => {
        const preset = STYLE_PRESETS.find((candidate) => candidate.id === value);
        if (preset) updateAppearance(preset.patch);
      },
    },
    {
      id: "accent", label: "Accent", keywords: ["color", "highlight"],
      options: ACCENT_PRESETS.map((accent) => ({ value: accent.id, label: accent.label })),
      current: () => readCurrentAppearance().accent,
      apply: (accent) => updateAppearance({ accent }),
      blocked: () => (FIXED_ACCENT_PALETTES.includes(readEffectivePalette())
        ? { reason: "Your color scheme sets the accent", open: openAppearance }
        : null),
    },
    axisSetting("density", ["spacing", "compact"]),
    axisSetting("radius", ["rounded", "radius"]),
    axisSetting("uiScale", ["font", "zoom", "scale"]),
    axisSetting("surface", ["glass", "blur", "transparency"]),
    axisSetting("elevation", ["shadow", "elevation"]),
    axisSetting("borders", ["outline"]),
    axisSetting("caretColor", ["cursor"]),
    axisSetting("caretShape", ["cursor"]),
    axisSetting("caretBlink", ["cursor"]),
    axisSetting("linkUnderline", ["accessibility"]),
    axisSetting("motion", ["animation", "accessibility"]),
    axisSetting("pageTransition", ["animation", "tab"]),
    axisSetting("overlayTransition", ["animation", "menu", "dialog"]),
    axisSetting("motionSpeed", ["animation", "duration"]),
    axisSetting("easing", ["animation", "curve", "bounce", "spring"]),
    axisSetting("pressFeedback", ["animation", "click", "squish", "tap"]),
    axisSetting("animatedImages", ["gif", "accessibility"]),
    axisSetting("hovercards", ["preview", "hover"]),
    axisSetting("urlPaste", ["url", "paste"]),
    {
      id: "sidebar-side", label: "Side bar", keywords: ["sidebar", "dock", "layout"],
      options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }],
      current: () => useUIStore.getState().sidebarSide,
      apply: (side) => useUIStore.getState().setSidebarSide(side === "right" ? "right" : "left"),
    },
    {
      id: "topbar-autohide", label: "Title bar", keywords: ["header", "hide", "layout"],
      options: [{ value: "shown", label: "Always shown" }, { value: "auto", label: "Auto-hide" }],
      current: () => (useUIStore.getState().topBarAutoHide ? "auto" : "shown"),
      apply: (value) => {
        if ((value === "auto") !== useUIStore.getState().topBarAutoHide) useUIStore.getState().toggleTopBarAutoHide();
      },
    },
  ];
}
