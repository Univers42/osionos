// The seeds every colour in the app grows from. A palette is a neutral hue
// with its chroma (how tinted the greys are) and an accent hue with its chroma;
// ramps.mjs turns those four numbers into every tone, in both modes. Where a
// palette's identity is a set of canonical colours (Nord's Polar Night,
// Solarized's base tones) the colours are pinned (scripts/tokens/pins/) rather than
// approximated.
//
// A palette's id is stored in each user's browser, so it never changes. Its
// label can: "warm" is shown as "Calm".
//
// `contrast: "AAA"` holds the palette to 7:1 on body text and on text placed on
// the accent; every other palette is held to AA (contrast.mjs).

import monoPins from "./pins/mono.mjs";
import contrastPins from "./pins/contrast.mjs";
import maximalPins from "./pins/maximal.mjs";
import nordPins from "./pins/nord.mjs";
import solarizedPins from "./pins/solarized.mjs";
import midnightPins from "./pins/midnight.mjs";
import rosePins from "./pins/rose.mjs";

export const MODES = ["light", "dark"];

export const PALETTES = [
  {
    id: "warm",
    label: "Calm",
    description: "Warm paper greys with one deep cobalt for actions, links and focus.",
    signatureMode: "light",
    neutral: { hue: 88, chroma: 0.012 },
    accent: { hue: 260.8, chroma: 0.176 },
  },
  {
    id: "mono",
    label: "Monochrome",
    description: "Editorial-brutalist pure grayscale: crisp ink-on-paper light, true-black dark, with semantic states whispered in desaturated hue.",
    signatureMode: "light",
    neutral: { hue: 0, chroma: 0 },
    accent: { hue: 0, chroma: 0 },
    pins: monoPins,
  },
  {
    id: "contrast",
    label: "High Contrast",
    description: "WCAG AAA: pure white with a deep-navy accent in light, pure black with electric yellow in dark, strong borders and vivid semantics.",
    signatureMode: "light",
    contrast: "AAA",
    neutral: { hue: 0, chroma: 0 },
    accent: { hue: 261, chroma: 0.148 },
    pins: contrastPins,
  },
  {
    id: "maximal",
    label: "Maximal",
    description: "Maximalist neon: electric magenta and cyan pops over clean violet-tinted canvases, with AA-safe body text.",
    signatureMode: "dark",
    neutral: { hue: 304, chroma: 0.028 },
    accent: { hue: 357, chroma: 0.24 },
    pins: maximalPins,
  },
  {
    id: "nord",
    label: "Nord",
    description: "The calm, cool arctic Nord palette: Snow Storm light / Polar Night dark with Frost accents and Aurora semantics.",
    signatureMode: "dark",
    neutral: { hue: 264, chroma: 0.024 },
    accent: { hue: 254, chroma: 0.09 },
    pins: nordPins,
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Ethan Schoonover's iconic warm-neutral palette with precise base tones and the eight signature accents.",
    signatureMode: "dark",
    neutral: { hue: 92, chroma: 0.026 },
    accent: { hue: 245, chroma: 0.13 },
    pins: solarizedPins,
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "A luxe, moody Tokyo-Night indigo/violet theme — deep blue-black surfaces, soft periwinkle text, a refined lavender light variant.",
    signatureMode: "dark",
    neutral: { hue: 280, chroma: 0.04 },
    accent: { hue: 295, chroma: 0.17 },
    pins: midnightPins,
  },
  {
    id: "rose",
    label: "Rosé Pine",
    description: "Soft, elegant Rosé Pine — muted rose, mauve and iris, a cozy dawn light and a deep soho twilight dark.",
    signatureMode: "dark",
    neutral: { hue: 72, chroma: 0.012 },
    accent: { hue: 305, chroma: 0.09 },
    pins: rosePins,
  },
  {
    id: "ember",
    label: "Ember",
    description: "Cream paper and terracotta — the original editorial look.",
    signatureMode: "light",
    neutral: { hue: 88, chroma: 0.012 },
    accent: { hue: 39, chroma: 0.125 },
  },
];
