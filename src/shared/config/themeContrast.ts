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

/** [text token, background token]: body text, secondary text and links on the two page surfaces, and the text on solid accent and danger. */
export const CONTRAST_PAIRS: readonly (readonly [fg: string, bg: string])[] = [
  ["fg-default", "bg-page"],
  ["fg-default", "bg-surface"],
  ["fg-muted", "bg-page"],
  ["fg-muted", "bg-surface"],
  ["link", "bg-page"],
  ["link", "bg-surface"],
  ["accent-fg", "accent"],
  ["danger-fg", "danger"],
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
