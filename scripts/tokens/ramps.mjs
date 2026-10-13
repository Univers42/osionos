// Turns a palette's seeds into the colours that differ between light and dark:
// the neutral ramp, the accent ramp, status colours, block tints, and the two
// graph colours that need the accent at partial opacity.
//
// Ponytail: the lightness of each tone is a table copied from the hand-tuned
// "warm" palette, not a model of perception. A palette whose hue is much
// brighter or duller at the same lightness (yellow, deep blue) can land a tone
// that is too faint or fails contrast. contrast.mjs is what proves a palette
// readable, and it fails the build; fix the seed, or the table for all palettes.
// A tone asked for outside sRGB loses chroma only (oklch.mjs), so a very
// saturated seed comes out duller than written without an error.

import { contrastRatio, hexToRgb, oklchToHex } from "./oklch.mjs";

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

const TINT_TONES = {
  light: {
    gray: { fg: [0.518, 0.01, 85], bg: [0.948, 0.011, 95] },
    brown: { fg: [0.458, 0.079, 52], bg: [0.933, 0.017, 68] },
    orange: { fg: [0.539, 0.146, 49], bg: [0.945, 0.029, 69] },
    yellow: { fg: [0.531, 0.111, 88], bg: [0.95, 0.043, 95] },
    green: { fg: [0.511, 0.128, 148], bg: [0.94, 0.024, 133] },
    blue: { fg: [0.524, 0.129, 249], bg: [0.943, 0.013, 229] },
    purple: { fg: [0.517, 0.123, 298], bg: [0.935, 0.017, 305] },
    pink: { fg: [0.538, 0.134, 352], bg: [0.938, 0.017, 350] },
    red: { fg: [0.5, 0.182, 30], bg: [0.934, 0.019, 33] },
  },
  dark: {
    gray: { fg: [0.765, 0.015, 85], bg: [0.275, 0.008, 75] },
    brown: { fg: [0.804, 0.054, 62], bg: [0.258, 0.023, 61] },
    orange: { fg: [0.77, 0.118, 75], bg: [0.26, 0.03, 66] },
    yellow: { fg: [0.823, 0.114, 96], bg: [0.267, 0.032, 98] },
    green: { fg: [0.744, 0.126, 149], bg: [0.267, 0.03, 150] },
    blue: { fg: [0.788, 0.067, 233], bg: [0.253, 0.023, 238] },
    purple: { fg: [0.788, 0.081, 302], bg: [0.25, 0.042, 298] },
    pink: { fg: [0.796, 0.079, 352], bg: [0.248, 0.031, 347] },
    red: { fg: [0.77, 0.109, 29], bg: [0.244, 0.033, 29] },
  },
};

// Opacity of the accent in the graph: [links between notes, background glow].
const GRAPH_ACCENT_ALPHA = { light: [0.5, 0.05], dark: [0.55, 0.1] };

const tone = ([l, c, h]) => oklchToHex({ l, c, h });

const seeded = ([l, share], { hue, chroma }) => oklchToHex({ l, c: chroma * share, h: hue });

function translucent(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readableOn(background, candidates) {
  return candidates.reduce((best, candidate) =>
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best,
  );
}

function neutralRamp(palette, mode) {
  return NEUTRAL_TONES[mode].map((step, index) => [`--osio-n-${index}`, seeded(step, palette.neutral)]);
}

function accentRamp(palette, mode) {
  const tones = ACCENT_TONES[mode];
  const solid = seeded(tones.solid, palette.accent);
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

function blockTints(mode) {
  return Object.entries(TINT_TONES[mode]).flatMap(([name, { fg, bg }]) => [
    [`--osio-block-tint-${name}-fg`, tone(fg)],
    [`--osio-block-tint-${name}-bg`, tone(bg)],
  ]);
}

/** Every token of `palette` whose value differs by mode, as { "--osio-…": "#RRGGBB" | "rgba(…)" }. */
export function modeTokens(palette, mode) {
  const accent = accentRamp(palette, mode);
  const [edgeAlpha, glowAlpha] = GRAPH_ACCENT_ALPHA[mode];
  return {
    ...Object.fromEntries(neutralRamp(palette, mode)),
    ...accent,
    ...Object.fromEntries(statusColours(mode)),
    ...Object.fromEntries(blockTints(mode)),
    "--osio-graph-edge-note": translucent(accent["--osio-a-solid"], edgeAlpha),
    "--osio-graph-field-warm": translucent(accent["--osio-a-solid"], glowAlpha),
  };
}
