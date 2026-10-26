/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeTokens.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one list of what a theme may set: every `--osio-*` token defined under
// src/app/styles/ is either here, with its kind and what it paints, or in
// EXCLUDED_TOKENS with the reason. tests/canvas/theme-catalog.test.ts reads the
// stylesheets and fails on a token that is neither, so a new token is
// classified the day it lands. Keys are the property names without `--osio-`.

import { COLOR_TOKEN_ROWS } from "./themeTokens.colors";

export type ThemeTokenKind = "color" | "length" | "number" | "font" | "shadow" | "duration" | "easing";
export type ThemeGroup = "colors" | "layout" | "fonts";

export interface ThemeToken {
  key: string;
  kind: ThemeTokenKind;
  group: ThemeGroup;
  description: string;
}

/** Colours go in `colors`; families, sizes, weights, line heights and letter spacing in `fonts`; the rest in `layout`. */
function groupOf(key: string, kind: ThemeTokenKind): ThemeGroup {
  if (kind === "color") return "colors";
  if (kind === "font" || /^(font-size|font-weight|line-height|letter-spacing)-/.test(key)) return "fonts";
  return "layout";
}

type Row = readonly [key: string, kind: ThemeTokenKind, description: string];

const SIZES = ["3xs", "2xs", "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "display"] as const;
const CONTROL_SIZES = { xs: "extra-small", sm: "small", md: "medium", lg: "large" } as const;

const LAYOUT_ROWS: Row[] = [
  ...Array.from({ length: 12 }, (_, index): Row => [`space-${index + 1}`, "length", `Spacing step ${index + 1}`]),
  ["radius", "length", "Default corner radius"],
  ["radius-xs", "length", "Smallest corner radius"],
  ["radius-sm", "length", "Small corner radius"],
  ["radius-lg", "length", "Large corner radius"],
  ["radius-full", "length", "Radius of pills and round badges"],
  ["radius-card", "length", "Corners of cards and canvas cells"],
  ["radius-chip", "length", "Corners of chips and tags"],
  ["radius-control", "length", "Corners of buttons and toggles"],
  ["radius-overlay", "length", "Corners of menus and popovers"],
  ["radius-pane", "length", "Corners of panes"],
  ["radius-panel", "length", "Corners of side panels"],
  ["radius-scale", "number", "Multiplier applied to every computed corner radius"],
  ...Object.entries(CONTROL_SIZES).map(([size, name]): Row => [`control-h-${size}`, "length", `Height of ${name} controls`]),
  ["control-radius", "length", "Button and toggle corners"],
  ["chip-h", "length", "Chip height"],
  ["chip-px", "length", "Side padding inside chips"],
  ["chip-radius", "length", "Chip corners"],
  ["field-h", "length", "Text field height"],
  ["field-radius", "length", "Text field corners"],
  ["border-width", "length", "Default border thickness"],
  ["dock-border-width", "length", "Bottom dock border thickness"],
  ["dock-min-h", "length", "Smallest height of the bottom dock"],
  ["focus-ring-width", "length", "Thickness of the keyboard focus ring"],
  ["focus-ring-offset", "length", "Gap between a control and its focus ring"],
  ["frame-gap", "length", "Gap between the window frame and the panes"],
  ["overlay-padding", "length", "Inner padding of menus and popovers"],
  ["overlay-radius", "length", "Menu and popover corners"],
  ["tooltip-radius", "length", "Tooltip corners"],
  ["page-max-width", "length", "Width of page content"],
  ["cell-comfortable-width", "length", "Comfortable width of a canvas cell"],
  ["cell-max-content-width", "length", "Widest content of a canvas cell"],
  ["cell-min-content-width", "length", "Narrowest content of a canvas cell"],
  ["cell-min-row-height", "length", "Smallest canvas row height"],
  ["cell-padding-block", "length", "Top and bottom padding inside canvas cells"],
  ["cell-padding-inline", "length", "Side padding inside canvas cells"],
  ["pane-outline-offset", "length", "Gap between a pane and its focus outline"],
  ["scroll-fade-size", "length", "Fade height at the edges of scrolling lists"],
  ["statusbar-h", "length", "Status bar height"],
  ["statusbar-px", "length", "Side padding of the status bar"],
  ["statusbar-end", "length", "Space kept free at the status bar's right end"],
  ["topbar-h", "length", "Top bar height"],
  ["shadow", "shadow", "Default shadow of floating surfaces"],
  ["shadow-sm", "shadow", "Small shadow of raised controls"],
  ["shadow-menu", "shadow", "Menu shadow"],
  ["shadow-modal", "shadow", "Dialog shadow"],
  ["shadow-cell", "shadow", "Canvas cell shadow"],
  ["shadow-cell-selected", "shadow", "Shadow of a selected canvas cell"],
  ...Array.from({ length: 6 }, (_, level): Row => [`e${level}`, "shadow", `Elevation shadow, level ${level}`]),
  ["overlay-shadow", "shadow", "Menu and popover shadow"],
  ["pane-shadow", "shadow", "Pane shadow"],
  ["dock-shadow", "shadow", "Bottom dock shadow"],
  ["code-shadow", "shadow", "Code block shadow"],
  ...["instant", "fast", "base", "slow"].map((speed): Row => [`dur-${speed}`, "duration", `Duration of ${speed} animations`]),
  ...["standard", "accelerate", "decelerate", "emphasized", "out", "spring"]
    .map((curve): Row => [`ease-${curve}`, "easing", `The ${curve} easing curve`]),
];

const FONT_ROWS: Row[] = [
  ["font-ui", "font", "Interface font"],
  ["font-heading", "font", "Heading font"],
  ["font-display", "font", "Font of display titles"],
  ["font-family-sans", "font", "Sans-serif font of page content"],
  ["font-family-serif", "font", "Serif font of page content"],
  ["font-family-mono", "font", "Monospace font of code"],
  ["font-size-ui", "length", "Interface text size"],
  ...SIZES.map((size): Row => [`font-size-${size}`, "length", `Text size ${size}`]),
  ...["normal", "medium", "semibold", "bold", "display"]
    .map((weight): Row => [`font-weight-${weight}`, "number", `Font weight of ${weight} text`]),
  ...["tight", "snug", "normal", "display"]
    .map((height): Row => [`line-height-${height}`, "number", `Line height, ${height}`]),
  ["letter-spacing-heading", "length", "Letter spacing of headings"],
  ["letter-spacing-display", "length", "Letter spacing of display titles"],
];

const toToken = ([key, kind, description]: Row): ThemeToken => ({ key, kind, group: groupOf(key, kind), description });

export const THEME_TOKENS: readonly ThemeToken[] = [
  ...COLOR_TOKEN_ROWS.map(([key, description]) => toToken([key, "color", description])),
  ...LAYOUT_ROWS.map(toToken),
  ...FONT_ROWS.map(toToken),
];

export const EXCLUDED_TOKENS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /^n-\d+$/, reason: "neutral ramp step; components read the semantic tokens built on it" },
  { pattern: /^a-[a-z]+$/, reason: "accent ramp step; set accent, accent-fg and the other accent tokens" },
  { pattern: /^z-[a-z]+$/, reason: "stacking order, not appearance" },
  { pattern: /^accent-hue$/, reason: "written by the custom accent picker in Settings" },
  { pattern: /^shadow-rgb$/, reason: "an rgb triplet the shadows mix, not a colour" },
  { pattern: /^fade-(top|bottom)$/, reason: "internal: set by a scrolling list as it scrolls" },
  { pattern: /^pane-zoom$/, reason: "internal: written by the pane zoom control" },
  { pattern: /^splitter-hit-min$/, reason: "internal: the pane splitter's hit area" },
  { pattern: /^transition-(colors|press)$/, reason: "shorthand: a list of transitions built from dur-* and ease-*" },
  { pattern: /^motion-(fast|slow|standard)$/, reason: "shorthand: a duration and a curve; set dur-* and ease-*" },
];

const BY_KEY = new Map(THEME_TOKENS.map((token) => [token.key, token]));

export function themeToken(key: string): ThemeToken | undefined {
  return BY_KEY.get(key);
}
