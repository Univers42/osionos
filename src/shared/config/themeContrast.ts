/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeContrast.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// WCAG 2 contrast for the text pairs a theme can break: the editor warns on a
// live pair under 4.5:1, and the shipped themes are held to it in a test.

type Rgb = readonly [number, number, number];

const PAGE_SURFACES = ["bg-page", "bg-surface", "bg-elevated", "bg-subtle", "bg-hover"] as const;

/**
 * [text token, background token]: the surfaces the app paints text on (page, surface, menus and popovers,
 * subtle rows, hovered rows), the code block and its header, and the text on each solid fill.
 * Caveat: a hand-kept list of token pairs, not derived from the components, so a combination nobody
 * lists (muted text on a tinted block) is unchecked. Status chips are not here: their colours are
 * derived (a wash mixed in CSS), and tests/canvas/status-tag-contrast.test.ts resolves them.
 */
export const CONTRAST_PAIRS: readonly (readonly [fg: string, bg: string])[] = [
  ...["fg-default", "fg-muted", "link"].flatMap((fg) => PAGE_SURFACES.map((bg) => [fg, bg] as const)),
  ["accent-fg", "accent"],
  ["accent-fg", "accent-hover"],
  ["update-fg", "update"],
  ["update-fg", "update-hover"],
  ["danger-fg", "danger"],
  ["danger-fg", "danger-hover"],
  ["success-fg", "success"],
  ["success-fg", "success-hover"],
  ["warning-fg", "warning"],
];

/**
 * The code block pairs. Kept out of CONTRAST_PAIRS because the live editor check paints each token on a
 * canvas, and the base theme's code header is a 2.5% alpha wash that a canvas reads as opaque white.
 * Caveat: a theme that sets neither end inherits the base theme's, so tests check only the themes that set both.
 */
export const CODE_CONTRAST_PAIRS: readonly (readonly [fg: string, bg: string])[] = [
  ["code-fg", "code-bg"],
  ["code-fg", "code-header-bg"],
  ["code-fg-muted", "code-header-bg"],
];

export const AA_TEXT_CONTRAST = 4.5;

/** `#rgb` or `#rrggbb` (an alpha digit pair is ignored) as 0–255 channels; null for anything else. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = match[1].length <= 4 ? [...match[1].slice(0, 3)].map((digit) => digit + digit) : [0, 2, 4].map((at) => match[1].slice(at, at + 2));
  return digits.map((pair) => Number.parseInt(pair, 16)) as [number, number, number];
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** The WCAG 2 contrast ratio of two colours, 1 to 21, in either order. Not rounded: 4.499 is not AA. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const toHex = (rgb: Rgb) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** `color` (opaque hex) when it reaches `ratio` on `background`, else the first colour on the way
 *  from it to black or white (whichever reads better on `background`) that does, in 2% steps.
 *  Either pole reaches at least 4.58:1 on any background, so a ratio up to that always holds. */
export function ensureContrast(color: string, background: string, ratio: number): string {
  const from = parseHexColor(color);
  const behind = parseHexColor(background);
  if (!from || !behind) throw new Error(`ensureContrast: ${color} on ${background} is not a pair of hex colours`);
  const pole: Rgb = contrastRatio([255, 255, 255], behind) >= contrastRatio([0, 0, 0], behind) ? [255, 255, 255] : [0, 0, 0];
  for (let step = 0; step <= 50; step += 1) {
    const t = step / 50;
    const mixed = from.map((channel, i) => channel + (pole[i] - channel) * t) as unknown as Rgb;
    const hex = toHex(mixed);
    if (contrastRatio(parseHexColor(hex) as Rgb, behind) >= ratio) return hex;
  }
  return toHex(pole);
}
