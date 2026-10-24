// Colours the graph engine and Monaco read by script. They parse only hex and
// comma-separated rgb()/rgba(), so every token they read is written in one of
// those two forms, never as oklch() or color-mix().

import { hexToRgb } from "./oklch.mjs";

/** `hex` at `alpha` as "rgba(r, g, b, a)". */
export function translucent(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `hex` as the space-separated channels "r g b" that `rgb(var(--token) / alpha)` takes. */
export function channels(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}
