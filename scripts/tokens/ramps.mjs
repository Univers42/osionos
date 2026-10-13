// Turns a palette's seeds into the colours that differ between light and dark:
// the neutral ramp, the accent ramp, status colours, block tints, the two
// graph colours that need the accent at partial opacity, and (ambient.mjs) the
// shadow, scrim and graph chrome tinted by the palette's own ramps.
//
// A palette's pins (palettes.mjs) replace generated values by name. They are
// applied before anything derived from them, so a pinned accent also decides
// the text colour placed on it.
//
// Ponytail: the lightness of each tone is a table copied from the hand-tuned
// "warm" palette, not a model of perception. A palette whose hue is much
// brighter or duller at the same lightness (yellow, deep blue) can land a tone
// that is too faint or fails contrast. contrast.mjs is what proves a palette
// readable, and it fails the build; fix the seed, or the table for all palettes.
// A tone asked for outside sRGB loses chroma only (oklch.mjs), so a very
// saturated seed comes out duller than written without an error.

import { ambientTokens } from "./ambient.mjs";
import { blockTints } from "./tints.mjs";
import { contrastRatio, oklchToHex } from "./oklch.mjs";
import { translucent } from "./translucent.mjs";

// Neutral steps are slots by role, not a light-to-dark scale: a card is lighter
// than the canvas in both modes, so no single order could be monotonic in both.
// Each entry is [lightness, share of the palette's neutral chroma].
const NEUTRAL_TONES = {
  light: [
    [0.956, 0.5], // 0  canvas, behind every card
    [1, 0], // 1  surface: cards, panels, inputs
    [0.982, 0.45], // 2  page
    [0.964, 0.8], // 3  subtle fill
    [0.945, 1], // 4  muted fill
    [0.948, 0.9], // 5  hover fill
    [1, 0], // 6  raised: menus, popovers
    [0.931, 0.95], // 7  border
    [0.876, 1.3], // 8  strong border
    [0.525, 1.1], // 9  subtle text
    [0.518, 0.85], // 10 muted text
    [0.217, 0.3], // 11 text
    [0.168, 0.15], // 12 strong text
  ],
  // Raised must differ from muted: a menu paints its panel with raised and its
  // highlighted row with muted, and equal values made the highlight invisible.
  dark: [
    [0.191, 0.8],
    [0.251, 0.4],
    [0.218, 0.5],
    [0.236, 0.55],
    [0.275, 0.7],
    [0.292, 0.75],
    [0.311, 0.8],
    [0.312, 1.2],
    [0.372, 1.5],
    [0.679, 1.3],
    [0.717, 1.3],
    [0.937, 0.8],
    [0.98, 0.7],
  ],
};

// [lightness, share of the palette's accent chroma].
const ACCENT_TONES = {
  light: { solid: [0.497, 1], hover: [0.447, 0.94], text: [0.476, 0.945], subtle: [0.955, 0.125] },
  dark: { solid: [0.72, 0.74], hover: [0.78, 0.6], text: [0.8, 0.57], subtle: [0.29, 0.28] },
};

// Text placed on a solid accent is white or this dark ink, whichever reads better.
const INK_TONE = [0.218, 0.5];

// Status colours and block tints mean the same thing in every palette (red is
// danger, green is success), so their hues are fixed: [lightness, chroma, hue].
const STATUS_TONES = {
  light: {
    danger: [0.5, 0.182, 30],
    "danger-hover": [0.423, 0.151, 29],
    success: [0.511, 0.128, 148],
    "success-hover": [0.444, 0.106, 148],
    warning: [0.539, 0.146, 49],
  },
  dark: {
    danger: [0.77, 0.109, 29],
    "danger-hover": [0.834, 0.077, 28],
    success: [0.744, 0.126, 149],
    "success-hover": [0.812, 0.099, 150],
    warning: [0.77, 0.118, 75],
  },
};

// Opacity of the accent in the graph: [links between notes, background glow].
const GRAPH_ACCENT_ALPHA = { light: [0.5, 0.05], dark: [0.55, 0.1] };

const tone = ([l, c, h]) => oklchToHex({ l, c, h });

const seeded = ([l, share], { hue, chroma }) => oklchToHex({ l, c: chroma * share, h: hue });

function readableOn(background, candidates) {
  return candidates.reduce((best, candidate) =>
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best,
  );
}

function neutralRamp(palette, mode) {
  return NEUTRAL_TONES[mode].map((step, index) => [`--osio-n-${index}`, seeded(step, palette.neutral)]);
}

function accentRamp(palette, mode, pins) {
  const tones = ACCENT_TONES[mode];
  const solid = pins["--osio-a-solid"] ?? seeded(tones.solid, palette.accent);
  return {
    "--osio-a-solid": solid,
    "--osio-a-hover": seeded(tones.hover, palette.accent),
    "--osio-a-fg": readableOn(solid, ["#FFFFFF", seeded(INK_TONE, palette.neutral)]),
    "--osio-a-text": seeded(tones.text, palette.accent),
    "--osio-a-subtle": seeded(tones.subtle, palette.accent),
  };
}

function statusColours(mode) {
  return Object.entries(STATUS_TONES[mode]).map(([name, lch]) => [`--osio-${name}`, tone(lch)]);
}

/** `tokens` with each pin that names one of its tokens swapped in; the key order does not change. */
const applyPins = (tokens, pins) =>
  Object.fromEntries(Object.entries(tokens).map(([name, value]) => [name, pins[name] ?? value]));

/** The pins of `palette` for `mode`, as { "--osio-…": "#RRGGBB" }. */
export const pinsOf = (palette, mode) => palette.pins?.[mode] ?? {};

/**
 * Every token of `palette` whose value differs by mode, as { "--osio-…": "#RRGGBB" | "rgba(…)" | "r g b" },
 * with the palette's pins on these tokens applied. A pin naming a public alias is not here: resolveTokens applies it.
 */
export function modeTokens(palette, mode) {
  const pins = pinsOf(palette, mode);
  const neutral = applyPins(Object.fromEntries(neutralRamp(palette, mode)), pins);
  const core = applyPins(
    {
      ...neutral,
      ...accentRamp(palette, mode, pins),
      ...Object.fromEntries(statusColours(mode)),
      ...blockTints(palette, mode, neutral, NEUTRAL_TONES[mode][4][0]),
    },
    pins,
  );
  const [edgeAlpha, glowAlpha] = GRAPH_ACCENT_ALPHA[mode];
  return applyPins(
    {
      ...core,
      "--osio-graph-edge-note": translucent(core["--osio-a-solid"], edgeAlpha),
      "--osio-graph-field-warm": translucent(core["--osio-a-solid"], glowAlpha),
      ...ambientTokens(core, palette, mode),
    },
    pins,
  );
}
