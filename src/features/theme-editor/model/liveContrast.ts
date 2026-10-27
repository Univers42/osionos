/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveContrast.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { CONTRAST_PAIRS, contrastRatio } from "@/shared/config/themeContrast";

// Resolves a token to sRGB by painting it on a 1x1 canvas: getComputedStyle
// can answer in oklch, but canvas normalises any CSS colour to RGBA, which is
// what contrastRatio needs. Caveat: a token whose value is not a paintable
// colour (for example a gradient or an unsupported string) is skipped.
export function liveContrastIssues(): { fg: string; bg: string; ratio: number }[] {
  if (typeof document === "undefined") return [];
  const resolve = (key: string): [number, number, number] | null => {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(`--osio-${key}`).trim();
      if (!value) return null;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "rgba(0,0,0,0)";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      if (data[3] === 0) return null;
      return [data[0], data[1], data[2]];
    } catch {
      return null;
    }
  };
  const issues: { fg: string; bg: string; ratio: number }[] = [];
  for (const [fg, bg] of CONTRAST_PAIRS) {
    const fgRgb = resolve(fg);
    const bgRgb = resolve(bg);
    if (!fgRgb || !bgRgb) continue;
    const ratio = contrastRatio(fgRgb, bgRgb);
    if (ratio < 4.5) issues.push({ fg, bg, ratio });
  }
  return issues;
}

