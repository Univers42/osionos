// The colours that are a palette's own ink or paper at some opacity: the shadow
// tint, the scrim behind dialogs, and the neutral chrome of the graph. They
// come from the palette's ramps, so a cool palette gets cool shadows and a
// graph that matches it, not the default palette's browns.
//
// Ponytail: the opacities are copied from the hand-tuned default palette, and
// each ramp slot is chosen to land near that palette's old value (warm light
// shadow 40 33 24 became 40 34 25). A palette with a very different lightness
// can need other opacities; the graph is judged by eye, not by a contrast rule.

import { hexToOklch, oklchToHex } from "./oklch.mjs";
import { channels, translucent } from "./translucent.mjs";

// The light-mode shadow is the neutral hue pulled a little warmer and darkened:
// a shadow reads as the surface it falls on, only deeper. -14 degrees is what
// turns the default neutral (hue 88) into the 74 of its old brown shadow.
const SHADOW_TONE = { lightness: 0.253, chromaShare: 1.6, hueShift: -14 };

/** The ink shadows are cast in, as "#RRGGBB": black on a dark page, a tinted dark on a light one. */
export function shadowInk(palette, mode) {
  if (mode === "dark") return "#000000";
  const { lightness, chromaShare, hueShift } = SHADOW_TONE;
  return oklchToHex({ l: lightness, c: palette.neutral.chroma * chromaShare, h: palette.neutral.hue + hueShift });
}

// The neutral the default palette's brown tint was tuned against: the tint's hue
// is rotated by how far a palette's neutral hue sits from this one, and its
// chroma scaled by the palette's neutral chroma, so a grey palette gets grey
// hierarchy edges and a blue one blue.
const REFERENCE_NEUTRAL = { hue: 88, chroma: 0.012 };

/** The brown tint foreground moved onto the palette's own neutral hue; unchanged for the default palette. */
function structuralInk(brownForeground, palette) {
  const { l, c, h } = hexToOklch(brownForeground);
  return oklchToHex({
    l,
    c: c * Math.min(1, palette.neutral.chroma / REFERENCE_NEUTRAL.chroma),
    h: h + palette.neutral.hue - REFERENCE_NEUTRAL.hue,
  });
}

// [slot, alpha] per mode. A slot is a neutral ramp step, "shadow", or "brown".
const GRAPH_CHROME = {
  light: {
    "--osio-graph-grain": ["n-10", 0.05],
    "--osio-graph-vignette": ["n-10", 0.07],
    "--osio-graph-node-backing": ["n-1", 1],
    "--osio-graph-node-rim": ["shadow", 0.12],
    "--osio-graph-node-shadow": ["shadow", 0.22],
    "--osio-graph-halo": ["n-2", 0.92],
    "--osio-graph-card-shadow": ["shadow", 0.08],
    "--osio-graph-edge": ["n-11", 0.22],
    "--osio-graph-edge-tag": ["brown", 0.16],
    "--osio-graph-edge-hier": ["brown", 0.62],
    "--osio-graph-overlay-bg": ["n-1", 0.82],
    "--osio-overlay": ["n-11", 0.42],
  },
  dark: {
    "--osio-graph-grain": ["n-11", 0.025],
    "--osio-graph-vignette": ["shadow", 0.4],
    "--osio-graph-node-backing": ["n-0", 0.72],
    "--osio-graph-node-rim": ["n-11", 0.16],
    "--osio-graph-node-shadow": ["shadow", 0.45],
    "--osio-graph-halo": ["n-2", 0.85],
    "--osio-graph-card-shadow": ["shadow", 0.55],
    "--osio-graph-edge": ["n-10", 0.26],
    "--osio-graph-edge-tag": ["brown", 0.16],
    "--osio-graph-edge-hier": ["brown", 0.78],
    "--osio-graph-overlay-bg": ["n-0", 0.74],
    "--osio-overlay": ["shadow", 0.6],
  },
};

/** `core` (a palette's ramps, pins applied) to the shadow, scrim and graph-chrome tokens. */
export function ambientTokens(core, palette, mode) {
  const ink = shadowInk(palette, mode);
  const slots = { shadow: ink, brown: structuralInk(core["--osio-block-tint-brown-fg"], palette) };
  const colourOf = (slot) => slots[slot] ?? core[`--osio-${slot}`];
  return {
    "--osio-shadow-rgb": channels(ink),
    "--osio-graph-bg-1": core["--osio-n-0"],
    ...Object.fromEntries(
      Object.entries(GRAPH_CHROME[mode]).map(([name, [slot, alpha]]) => [name, translucent(colourOf(slot), alpha)]),
    ),
  };
}
