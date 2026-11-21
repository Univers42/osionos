// The hue a status colour must have to be read as what it means: success green, warning amber.
//
// Caveat: hue alone, on an HSL wheel. A pale grey-green or a near-black passes, and the ranges are a
// judgement (Solarized's own green sits at 68 degrees, so green starts at 60). It catches a theme that
// turned success blue or warning red, as Forest Canopy and Phosphor Terminal had (a cyan success, 185
// and 187 degrees); it cannot say a colour looks good. Move a bound only with a measured colour.

import { parseHexColor } from "../../src/shared/config/themeContrast.ts";

export const GREEN_HUE = [60, 170] as const;
export const AMBER_HUE = [20, 55] as const;

/** Hue in degrees [0, 360) of a `#rrggbb` colour; null for a grey or for anything that is not hex. */
export function hueOfHex(hex: string): number | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const [red, green, blue] = rgb.map((channel) => channel / 255);
  const top = Math.max(red, green, blue);
  const spread = top - Math.min(red, green, blue);
  if (spread === 0) return null;
  const sector = top === red ? ((green - blue) / spread) % 6 : top === green ? (blue - red) / spread + 2 : (red - green) / spread + 4;
  return (sector * 60 + 360) % 360;
}

export const withinHue = (hue: number | null, [low, high]: readonly [number, number]) => hue !== null && hue >= low && hue <= high;
