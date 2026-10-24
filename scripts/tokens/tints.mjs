// The nine block tints (callouts, highlights, syntax colours): a foreground and
// a background each. Their hues mean the same in every palette (red is red), but
// they sit on the palette's own surfaces, so the background follows the
// palette's muted fill in lightness and the gray tint follows its neutral hue.
//
// Ponytail: the foreground is repaired by lightness alone, in steps, until it
// reads on its background, the surface and the page. A tint whose hue cannot
// reach AA at any lightness (a very saturated yellow on a mid-grey fill)
// leaves the loop at its limit unrepaired, and contrast.mjs then fails the build.

import { contrastRatio, hexToOklch, oklchToHex } from "./oklch.mjs";

const AA_TEXT = 4.5;
const REPAIR_STEP = 0.005;
const REPAIR_LIMIT = 60;

// The neutral chroma the gray tint was tuned against; other palettes scale it.
const REFERENCE_NEUTRAL_CHROMA = 0.012;

// The muted fill is the ramp step a tinted block replaces.
const MUTED_FILL = "--osio-n-4";

// { fg, bg }: [lightness, chroma, hue].
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


// Hex rounding moves an unpinned slot's lightness by about a thousandth; whole
// hundredths are the shifts that come from a palette actually differing.
const shiftOf = (neutral, referenceFill) => Math.round((hexToOklch(neutral[MUTED_FILL]).l - referenceFill) * 100) / 100;

function repaired(foreground, backgrounds, mode) {
  const direction = mode === "light" ? -1 : 1;
  let { l, c, h } = foreground;
  for (let step = 0; step < REPAIR_LIMIT; step += 1) {
    const hex = oklchToHex({ l, c, h });
    if (backgrounds.every((background) => contrastRatio(hex, background) >= AA_TEXT)) return hex;
    l += direction * REPAIR_STEP;
  }
  return oklchToHex({ l, c, h });
}

/**
 * The tint foreground and background tokens of a palette in `mode`, on its (pinned) `neutral` ramp.
 * `referenceFill` is the lightness the tone table was tuned for the muted fill to have.
 */
export function blockTints(palette, mode, neutral, referenceFill) {
  const shift = shiftOf(neutral, referenceFill);
  const surfaces = [neutral["--osio-n-1"], neutral["--osio-n-2"]];
  const scale = palette.neutral.chroma / REFERENCE_NEUTRAL_CHROMA;
  return Object.fromEntries(
    Object.entries(TINT_TONES[mode]).flatMap(([name, { fg, bg }]) => {
      const gray = name === "gray";
      const [bgL, bgC, bgH] = bg;
      const background = oklchToHex({
        l: bgL + shift,
        c: gray ? bgC * scale : bgC,
        h: gray ? palette.neutral.hue : bgH,
      });
      const [fgL, fgC, fgH] = fg;
      const foreground = repaired(
        { l: fgL, c: gray ? fgC * scale : fgC, h: gray ? palette.neutral.hue : fgH },
        [background, ...surfaces],
        mode,
      );
      return [
        [`--osio-block-tint-${name}-fg`, foreground],
        [`--osio-block-tint-${name}-bg`, background],
      ];
    }),
  );
}
