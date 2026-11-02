// A code theme as VS Code settings, for the terminal page and the IDE page: one default theme of
// the right side of light or dark, repainted part by part in the app's colours, with the app's
// code font. Every colour here is a theme colour or one with an alpha added; nothing is invented.
import { ANSI_KEYS, type CodeTheme } from "./codeTheme.ts";
import type { TerminalColors } from "./terminalPort.ts";

/** `hex` (#rgb, #rgba, #rrggbb or #rrggbbaa) at `opacity` (0-1), as #RRGGBBAA. */
function alpha(hex: string, opacity: number): string {
  const digits = hex.length <= 5 ? [...hex.slice(1, 4)].map((d) => d + d).join("") : hex.slice(1, 7);
  return `#${digits}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`.toUpperCase();
}

function chromeColors(c: CodeTheme["colors"]): Record<string, string> {
  const none = alpha(c.bg, 0);
  return {
    foreground: c.fg, descriptionForeground: c.fgMuted, disabledForeground: c.fgSubtle, errorForeground: c.danger,
    focusBorder: c.focus, "selection.background": c.selection, "icon.foreground": c.fgMuted, "sash.hoverBorder": c.focus,
    "widget.border": c.border, "widget.shadow": alpha(c.fg, 0.12), "textLink.foreground": c.accentText, "textLink.activeForeground": c.accentText,
    "panel.background": c.bg, "panel.border": c.border, "panelTitle.activeForeground": c.fg, "panelTitle.activeBorder": c.accent,
    "panelTitle.inactiveForeground": c.fgMuted, "panelInput.border": c.border, "panelSection.border": c.border,
    "editorGroupHeader.tabsBackground": c.bg, "editorGroupHeader.tabsBorder": c.border, "editorGroup.border": c.border,
    "editorGroup.dropBackground": alpha(c.accent, 0.12), "tab.activeBackground": c.bg, "tab.activeForeground": c.fg,
    "tab.inactiveBackground": c.bg, "tab.inactiveForeground": c.fgMuted, "tab.hoverBackground": c.hover, "tab.border": c.bg,
    "tab.activeBorder": c.accent, "tab.activeBorderTop": none, "tab.unfocusedActiveBorder": c.border, "terminal.tab.activeBorder": c.accent,
    "toolbar.hoverBackground": c.hover, "toolbar.activeBackground": c.selected,
    "list.activeSelectionBackground": c.selected, "list.activeSelectionForeground": c.fg, "list.inactiveSelectionBackground": c.hover,
    "list.hoverBackground": c.hover, "list.focusBackground": c.selected, "list.focusOutline": c.focus, "list.highlightForeground": c.accentText,
    "list.dropBackground": alpha(c.accent, 0.12),
    "input.background": c.raised, "input.foreground": c.fg, "input.border": c.border, "input.placeholderForeground": c.fgSubtle,
    "inputOption.activeBorder": c.accent, "inputOption.activeBackground": c.selected, "inputValidation.errorBorder": c.danger,
    "button.background": c.accent, "button.foreground": c.onAccent, "button.hoverBackground": c.accentHover,
    "button.secondaryBackground": c.hover, "button.secondaryForeground": c.fg, "button.secondaryHoverBackground": c.selected,
    "checkbox.background": c.raised, "checkbox.border": c.border, "checkbox.foreground": c.fg,
    "dropdown.background": c.raised, "dropdown.listBackground": c.raised, "dropdown.foreground": c.fg, "dropdown.border": c.border,
    "menu.background": c.raised, "menu.foreground": c.fg, "menu.border": c.border, "menu.selectionBackground": c.selected,
    "menu.selectionForeground": c.fg, "menu.separatorBackground": c.border,
    "quickInput.background": c.raised, "quickInput.foreground": c.fg, "quickInputList.focusBackground": c.selected,
    "quickInputTitle.background": c.hover, "pickerGroup.foreground": c.accentText, "pickerGroup.border": c.border,
    "badge.background": c.accent, "badge.foreground": c.onAccent, "progressBar.background": c.accent,
    "keybindingLabel.background": c.hover, "keybindingLabel.foreground": c.fg, "keybindingLabel.border": c.border, "keybindingLabel.bottomBorder": c.border,
    "notifications.background": c.raised, "notifications.foreground": c.fg, "notifications.border": c.border, "notificationCenterHeader.background": c.hover,
    "notificationsErrorIcon.foreground": c.danger, "notificationsWarningIcon.foreground": c.warning, "notificationsInfoIcon.foreground": c.accent,
    "scrollbarSlider.background": c.scrollbar, "scrollbarSlider.hoverBackground": alpha(c.fgSubtle, 0.55),
    "scrollbarSlider.activeBackground": alpha(c.fgSubtle, 0.7), "scrollbar.shadow": none,
    "sideBar.background": c.bg, "sideBar.foreground": c.fg, "sideBar.border": c.border, "sideBarTitle.foreground": c.fgMuted,
    "sideBarSectionHeader.background": c.bg, "sideBarSectionHeader.foreground": c.fgMuted, "sideBarSectionHeader.border": c.border,
    "activityBar.background": c.bg, "activityBar.foreground": c.fg, "activityBar.inactiveForeground": c.fgSubtle, "activityBar.border": c.border,
    "activityBar.activeBorder": c.accent, "activityBarBadge.background": c.accent, "activityBarBadge.foreground": c.onAccent,
    "statusBar.background": c.bg, "statusBar.foreground": c.fgMuted, "statusBar.border": c.border, "statusBar.noFolderBackground": c.bg,
    "statusBarItem.hoverBackground": c.hover, "statusBarItem.remoteBackground": c.accent, "statusBarItem.remoteForeground": c.onAccent,
    "titleBar.activeBackground": c.bg, "titleBar.activeForeground": c.fg, "titleBar.inactiveBackground": c.bg,
    "titleBar.inactiveForeground": c.fgMuted, "titleBar.border": c.border,
  };
}

function editorColors(c: CodeTheme["colors"]): Record<string, string> {
  return {
    "editor.background": c.bg, "editor.foreground": c.fg, "editorGutter.background": c.bg, "editorCursor.foreground": c.cursor,
    "editorLineNumber.foreground": c.fgSubtle, "editorLineNumber.activeForeground": c.fg, "editor.selectionBackground": c.selection,
    "editor.inactiveSelectionBackground": alpha(c.accent, 0.15), "editor.lineHighlightBackground": alpha(c.fg, 0.05),
    "editor.lineHighlightBorder": alpha(c.bg, 0), "editor.findMatchBackground": alpha(c.accent, 0.35),
    "editor.findMatchHighlightBackground": alpha(c.accent, 0.18), "editorBracketMatch.background": alpha(c.accent, 0.22),
    "editorBracketMatch.border": c.border, "editorIndentGuide.background1": c.border, "editorIndentGuide.activeBackground1": c.fgSubtle,
    "editorWhitespace.foreground": c.border, "editorOverviewRuler.border": alpha(c.bg, 0), "editorError.foreground": c.danger,
    "editorWarning.foreground": c.warning, "editorInfo.foreground": c.accent, "editorLink.activeForeground": c.accentText,
    "editorWidget.background": c.raised, "editorWidget.foreground": c.fg, "editorWidget.border": c.border,
    "editorHoverWidget.background": c.raised, "editorHoverWidget.foreground": c.fg, "editorHoverWidget.border": c.border,
    "editorSuggestWidget.background": c.raised, "editorSuggestWidget.foreground": c.fg, "editorSuggestWidget.border": c.border,
    "editorSuggestWidget.selectedBackground": c.selected, "editorSuggestWidget.highlightForeground": c.accentText,
  };
}

function terminalColors(theme: CodeTheme): Record<string, string> {
  const c = theme.colors;
  const colors: Record<string, string> = {
    "terminal.background": c.bg, "terminal.foreground": c.fg, "terminal.border": c.border, "terminalCursor.foreground": c.cursor,
    "terminalCursor.background": c.bg, "terminal.selectionBackground": c.selection, "terminal.inactiveSelectionBackground": alpha(c.accent, 0.15),
    "terminal.findMatchBackground": alpha(c.accent, 0.4), "terminal.findMatchHighlightBackground": alpha(c.accent, 0.2),
    "terminal.dropBackground": alpha(c.accent, 0.12), "terminalOverviewRuler.cursorForeground": c.cursor,
    "terminalCommandDecoration.defaultBackground": c.fgSubtle, "terminalCommandDecoration.successBackground": c.success,
    "terminalCommandDecoration.errorBackground": c.danger,
  };
  for (const key of ANSI_KEYS) colors[`terminal.ansi${key[0].toUpperCase()}${key.slice(1)}`] = theme.ansi[key];
  return colors;
}

const SCOPES: Record<keyof CodeTheme["syntax"], string[]> = {
  keyword: ["keyword", "storage", "storage.type", "keyword.control"],
  string: ["string", "string.quoted"],
  comment: ["comment", "punctuation.definition.comment"],
  function: ["entity.name.function", "support.function", "meta.function-call"],
  number: ["constant.numeric"],
  literal: ["constant.language", "constant.character", "support.constant"],
  property: ["variable.other.property", "support.type.property-name", "meta.object-literal.key"],
  type: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
  tag: ["entity.name.tag"],
  attr: ["entity.other.attribute-name"],
};

function syntaxRules(syntax: CodeTheme["syntax"]) {
  return (Object.keys(SCOPES) as (keyof typeof SCOPES)[]).map((key) => ({
    scope: SCOPES[key],
    settings: { foreground: syntax[key], ...(key === "comment" ? { fontStyle: "italic" } : {}) },
  }));
}

export function codeThemeSettings(theme: CodeTheme): Record<string, unknown> {
  return {
    "workbench.colorTheme": theme.kind === "light" ? "Default Light Modern" : "Default Dark Modern",
    "workbench.colorCustomizations": { ...chromeColors(theme.colors), ...editorColors(theme.colors), ...terminalColors(theme) },
    "editor.tokenColorCustomizations": { textMateRules: syntaxRules(theme.syntax) },
    "terminal.integrated.fontFamily": theme.fonts.mono,
    "terminal.integrated.fontSize": theme.fontSize,
    "terminal.integrated.lineHeight": theme.lineHeight,
    "terminal.integrated.cursorStyle": "line",
    "terminal.integrated.cursorBlinking": true,
    "editor.fontFamily": theme.fonts.mono,
    "editor.fontSize": theme.fontSize,
    "editor.fontLigatures": false,
    "editor.cursorStyle": "line",
    "editor.cursorBlinking": "smooth",
  };
}

// The settings a page used before the app sent a whole theme (an app older than the page).
// Caveat: light/dark is the background's perceived brightness against the midpoint; a mid-grey dock
// (around #808080) can land on the theme whose foreground colours have less contrast.
const isLight = (hex: string): boolean => {
  const full = hex.length <= 5 ? [...hex.slice(1, 4)].map((c) => c + c).join("") : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 128;
};

export function legacyTerminalSettings(colors: TerminalColors): Record<string, unknown> {
  const customizations: Record<string, string> = {};
  if (colors.background) {
    customizations["terminal.background"] = colors.background;
    customizations["panel.background"] = colors.background;
  }
  if (colors.foreground) customizations["terminal.foreground"] = colors.foreground;
  if (colors.cursor) customizations["terminalCursor.foreground"] = colors.cursor;
  if (colors.selection) customizations["terminal.selectionBackground"] = colors.selection;
  return {
    "workbench.colorTheme": colors.background && isLight(colors.background) ? "Default Light Modern" : "Default Dark Modern",
    "workbench.colorCustomizations": customizations,
  };
}
