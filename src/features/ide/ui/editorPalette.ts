/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editorPalette.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editor's colors, computed — never written. Monaco's defineTheme() takes
// literal colors and cannot resolve `var(--osio-…)`, so a naive port would
// silently drop the whole palette system. This module is the pure half of the
// bridge: it turns the CSS values RESOLVED AT RUNTIME on the editor's host
// element (monacoTheme.ts reads them) into a Monaco theme. Every color here is
// derived from a resolved token or from another resolved color; there is no
// literal hex anywhere, so the 7 palettes × 2 themes (and the per-block
// `data-code-theme` card toggle) all flow through unchanged. Pure so the canvas
// suite can test it under node.

export const SYNTAX_KEYS = ["keyword", "string", "comment", "function", "number", "literal", "property", "type", "tag", "attr"] as const;
export type SyntaxKey = (typeof SYNTAX_KEYS)[number];

/** Raw CSS strings as read from the host (empty string = token not defined). */
export interface EditorTokenInput {
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  chipBg: string;
  headerBg: string;
  accent: string;
  danger: string;
  warning: string;
  selection: string;
  activeLine: string;
  bracket: string;
  syntax: Record<SyntaxKey, string>;
  /** The painted background behind the host (first opaque ancestor) — the
   *  fallback when `--osio-code-bg` is not defined on this surface. */
  effectiveBg: string;
  /** The host's computed `color` — always resolvable. */
  effectiveFg: string;
}

export interface EditorThemeData {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: { token: string; foreground?: string; fontStyle?: string }[];
  colors: Record<string, string>;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

function channel(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (comma or space syntax) →
 *  `#RRGGBB` or `#RRGGBBAA`. Null for anything else, including a transparent value. */
export function normalizeColor(css: string | null | undefined): string | null {
  const value = (css ?? "").trim();
  if (!value) return null;
  const hex = HEX.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = digits.split("").map((d) => d + d).join("");
    const out = `#${digits.toUpperCase()}`;
    return out.length === 9 && out.endsWith("00") ? null : out;
  }
  const rgb = RGB.exec(value);
  if (!rgb) return null;
  const alphaRaw = rgb[4];
  const alpha = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
  if (alpha <= 0) return null;
  const base = `#${channel(Number(rgb[1]))}${channel(Number(rgb[2]))}${channel(Number(rgb[3]))}`;
  return alpha >= 1 ? base : `${base}${channel(alpha * 255)}`;
}

function rgbOf(hex: string): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return [r, g, b, a];
}

/** A normalized color with its alpha replaced (0–1). */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex.slice(0, 7)}${channel(alpha * 255)}`;
}

/** `top` (possibly translucent) composited over an opaque `bottom` → opaque hex. */
export function composite(top: string, bottom: string): string {
  const [tr, tg, tb, ta] = rgbOf(top);
  const [br, bg, bb] = rgbOf(bottom);
  const mix = (t: number, b: number) => t * ta + b * (1 - ta);
  return `#${channel(mix(tr, br))}${channel(mix(tg, bg))}${channel(mix(tb, bb))}`;
}

/** The opposite tone of an opaque color — the last-resort background when no
 *  ancestor paints one (keeps text readable without inventing a literal). */
export function invert(hex: string): string {
  const [r, g, b] = rgbOf(hex);
  return `#${channel(255 - r)}${channel(255 - g)}${channel(255 - b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white) of an opaque color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The resolved, opaque-where-needed color set every Monaco key is built from. */
export interface EditorColors {
  base: "vs" | "vs-dark";
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  chipBg: string;
  widgetBg: string;
  accent: string;
  danger: string;
  warning: string;
  selection: string;
  activeLine: string;
  bracket: string;
  syntax: Record<SyntaxKey, string | null>;
}

/** Fallback chain per role: the surface token, else a color derived from what
 *  DID resolve. The IDE shell defines the syntax tokens at the palette level but
 *  not the `--osio-code-*` chrome (those live on the read-only code card), so
 *  the derived branch is the common path there. */
export function resolveEditorColors(input: EditorTokenInput): EditorColors {
  const fgToken = normalizeColor(input.fg) ?? normalizeColor(input.effectiveFg);
  const bgToken = normalizeColor(input.bg) ?? normalizeColor(input.effectiveBg);
  let fg: string;
  let bgRaw: string;
  if (fgToken) { fg = fgToken; bgRaw = bgToken ?? invert(fgToken); }
  else if (bgToken) { bgRaw = bgToken; fg = invert(bgToken); }
  else throw new Error("editor palette: neither a foreground nor a background color resolved on the editor host");
  // A translucent surface token is flattened over what is painted behind it.
  const bg = bgRaw.length === 9 ? composite(bgRaw, normalizeColor(input.effectiveBg)?.slice(0, 7) ?? invert(fg)) : bgRaw;
  const base: "vs" | "vs-dark" = relativeLuminance(bg) < relativeLuminance(fg) ? "vs-dark" : "vs";
  const accent = normalizeColor(input.accent) ?? fg;
  const overBg = (hex: string) => composite(hex, bg);
  const syntax = {} as Record<SyntaxKey, string | null>;
  for (const key of SYNTAX_KEYS) syntax[key] = normalizeColor(input.syntax[key]);
  return {
    base,
    bg,
    fg,
    fgMuted: overBg(normalizeColor(input.fgMuted) ?? withAlpha(fg, 0.6)),
    border: overBg(normalizeColor(input.border) ?? withAlpha(fg, 0.15)),
    chipBg: overBg(normalizeColor(input.chipBg) ?? withAlpha(fg, 0.06)),
    widgetBg: overBg(normalizeColor(input.headerBg) ?? withAlpha(fg, 0.04)),
    accent,
    danger: normalizeColor(input.danger) ?? accent,
    warning: normalizeColor(input.warning) ?? accent,
    selection: normalizeColor(input.selection) ?? withAlpha(accent, 0.28),
    activeLine: normalizeColor(input.activeLine) ?? withAlpha(fg, 0.06),
    bracket: normalizeColor(input.bracket) ?? withAlpha(accent, 0.22),
    syntax,
  };
}

/** Monarch token scopes → the syntax roles, mirroring the Lezer mapping the
 *  CodeMirror theme carried (comment italic, invalid in the danger color, markdown
 *  strong/emphasis as font styles). Monaco resolves a scope by longest prefix, so
 *  `keyword.control` inherits `keyword`. */
const SCOPE_ROLES: [string, SyntaxKey][] = [
  ["keyword", "keyword"], ["storage", "keyword"], ["key", "property"],
  ["string", "string"], ["string.escape", "string"], ["regexp", "string"],
  ["annotation", "comment"], ["meta", "comment"], ["metatag", "tag"], // `comment` itself gets the italic rule below
  ["entity.name.function", "function"], ["support.function", "function"], ["predefined", "function"], ["string.link", "function"],
  ["number", "number"],
  ["constant", "literal"], ["constant.language", "literal"], ["variable.predefined", "literal"],
  ["attribute.value", "property"], ["variable.name", "property"],
  ["type", "type"], ["type.identifier", "type"], ["namespace", "type"], ["entity.name.type", "type"],
  ["tag", "tag"], ["attribute.name", "attr"],
];

export function buildEditorTheme(colors: EditorColors): EditorThemeData {
  const rules: EditorThemeData["rules"] = [];
  for (const [token, role] of SCOPE_ROLES) {
    const foreground = colors.syntax[role];
    if (foreground) rules.push({ token, foreground: foreground.slice(1, 7) });
  }
  const comment = colors.syntax.comment;
  rules.push({ token: "comment", fontStyle: "italic", ...(comment ? { foreground: comment.slice(1, 7) } : {}) });
  rules.push({ token: "strong", fontStyle: "bold" }, { token: "emphasis", fontStyle: "italic" });
  rules.push({ token: "invalid", foreground: colors.danger.slice(1, 7) });
  const transparent = withAlpha(colors.bg, 0);
  const listSelection = withAlpha(colors.accent, 0.25);
  return {
    base: colors.base,
    inherit: true,
    rules,
    colors: {
      "editor.background": colors.bg,
      "editor.foreground": colors.fg,
      "editorLineNumber.foreground": colors.fgMuted,
      "editorLineNumber.activeForeground": colors.fg,
      "editorGutter.background": colors.bg,
      "editorCursor.foreground": colors.accent,
      "editor.selectionBackground": colors.selection,
      "editor.inactiveSelectionBackground": withAlpha(colors.selection, 0.5),
      "editor.lineHighlightBackground": colors.activeLine,
      "editor.lineHighlightBorder": transparent,
      "editorBracketMatch.background": colors.bracket,
      "editorBracketMatch.border": colors.border,
      "editor.findMatchBackground": withAlpha(colors.accent, 0.35),
      "editor.findMatchHighlightBackground": withAlpha(colors.accent, 0.18),
      "editorWidget.background": colors.widgetBg,
      "editorWidget.foreground": colors.fg,
      "editorWidget.border": colors.border,
      "editorHoverWidget.background": colors.widgetBg,
      "editorHoverWidget.foreground": colors.fg,
      "editorHoverWidget.border": colors.border,
      "editorSuggestWidget.background": colors.widgetBg,
      "editorSuggestWidget.foreground": colors.fg,
      "editorSuggestWidget.border": colors.border,
      "editorSuggestWidget.selectedBackground": listSelection,
      "editorSuggestWidget.selectedForeground": colors.fg,
      "editorSuggestWidget.highlightForeground": colors.accent,
      "editorSuggestWidget.focusHighlightForeground": colors.accent,
      "list.hoverBackground": withAlpha(colors.accent, 0.12),
      "list.activeSelectionBackground": listSelection,
      "list.focusBackground": listSelection,
      "quickInput.background": colors.widgetBg,
      "quickInput.foreground": colors.fg,
      "input.background": colors.chipBg,
      "input.foreground": colors.fg,
      "input.border": colors.border,
      "menu.background": colors.widgetBg,
      "menu.foreground": colors.fg,
      "menu.border": colors.border,
      "menu.selectionBackground": listSelection,
      "menu.selectionForeground": colors.fg,
      "editorError.foreground": colors.danger,
      "editorWarning.foreground": colors.warning,
      "editorInfo.foreground": colors.accent,
      "editorLink.activeForeground": colors.accent,
      "textLink.foreground": colors.accent,
      "scrollbarSlider.background": withAlpha(colors.fg, 0.12),
      "scrollbarSlider.hoverBackground": withAlpha(colors.fg, 0.2),
      "scrollbarSlider.activeBackground": withAlpha(colors.fg, 0.28),
      "editorOverviewRuler.border": transparent,
      "focusBorder": transparent,
    },
  };
}
