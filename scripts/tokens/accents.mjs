// The accent a person picks on top of whatever palette is active: eight presets
// and one free hue. A preset or the custom hue replaces only the five accent
// tones (--osio-a-*); every alias that points at them (the Update button, links,
// the graph's selection) follows, and the palette's surfaces are untouched.
//
// Cobalt is the default preset: it is the default palette's own accent, so it
// writes no block and a stored "cobalt" costs nothing.
//
// The blocks are `:root[data-accent="id"][data-theme="mode"]` (0,3,0), which
// beats a palette's `[data-palette][data-theme]` (0,2,0), so a preset wins over
// whichever palette is active without caring about load order.
//
// Ponytail: contrast is proved against every palette's surfaces with the tone
// tables of ramps.mjs, in sRGB hex. The custom hue is written in the page as
// oklch(L C var(--osio-accent-hue)); where C is outside the sRGB gamut at a hue
// (teal at the lightness of the solid tone) the browser maps it its own way,
// which can differ from the chroma clip proved here by a few hundredths of
// lightness. The margin over 4.5:1 is what absorbs that, and the 360-hue sweep
// in tests/canvas/tokens-accent-sweep.test.ts is what pins it.
// A palette's pinned accent is replaced by a preset on purpose: choosing Ember
// in Nord is a choice the person made. A palette that promises AAA (7:1 for the
// text on its accent) is the exception: no preset tone reaches 7:1 white-on-accent
// at a lightness that still reads as a colour, so its blocks are not matched by
// the accent selectors and it keeps its own accent.

import { aliasPinsOf, resolveTokens } from "./aliases.mjs";
import { contrastFailures } from "./contrast.mjs";
import { oklchToHex } from "./oklch.mjs";
import { PALETTES } from "./palettes.mjs";
import { ACCENT_TONES, INK_TONE, modeTokens } from "./ramps.mjs";

export const GENERATED_ACCENT_STYLESHEET = "src/app/styles/accents.generated.css";
export const GENERATED_ACCENT_REGISTRY = "src/shared/config/accents.generated.ts";

export const DEFAULT_ACCENT = "cobalt";

const MODES = ["light", "dark"];

// Seeds: hue and chroma. Graphite is a neutral with a whisper of blue.
export const ACCENT_PRESETS = [
  { id: "cobalt", label: "Cobalt" },
  { id: "ember", label: "Ember", hue: 39, chroma: 0.125 },
  { id: "indigo", label: "Indigo", hue: 275, chroma: 0.16 },
  { id: "violet", label: "Violet", hue: 300, chroma: 0.16 },
  { id: "rose", label: "Rose", hue: 10, chroma: 0.16 },
  { id: "green", label: "Green", hue: 150, chroma: 0.12 },
  { id: "teal", label: "Teal", hue: 195, chroma: 0.09 },
  { id: "graphite", label: "Graphite", hue: 260, chroma: 0.02 },
];

// [lightness, share of the preset's chroma]. Light is the palettes' own table.
// Dark text and hover sit lighter than the palettes' (0.78, 0.8): Nord's dark
// surfaces are pinned at about 0.39, where 0.8 reaches only 4.1:1.
const TONES = {
  light: ACCENT_TONES.light,
  dark: { ...ACCENT_TONES.dark, hover: [0.85, 0.6], text: [0.85, 0.57] },
};

// The custom hue's constants: [lightness, chroma] per tone. Lightness is the
// tone table's own; chroma is the most that stays near the gamut at every hue.
const CUSTOM_CHROMA = {
  light: { solid: 0.14, hover: 0.13, text: 0.13, subtle: 0.02 },
  dark: { solid: 0.12, hover: 0.1, text: 0.1, subtle: 0.04 },
};

const INK = oklchToHex({ l: INK_TONE[0], c: 0, h: 0 });
const FG = { light: "#FFFFFF", dark: INK };

const customTone = (mode, name) => [TONES[mode][name][0], CUSTOM_CHROMA[mode][name]];

/** The five accent tokens of preset `id` in `mode`, as { "--osio-a-…": "#RRGGBB" }. */
export function presetTokens(id, mode) {
  const { hue, chroma } = ACCENT_PRESETS.find((preset) => preset.id === id);
  const tone = (name) => {
    const [l, share] = TONES[mode][name];
    return oklchToHex({ l, c: chroma * share, h: hue });
  };
  return {
    "--osio-a-solid": tone("solid"),
    "--osio-a-hover": tone("hover"),
    "--osio-a-fg": FG[mode],
    "--osio-a-text": tone("text"),
    "--osio-a-subtle": tone("subtle"),
  };
}

/** The five accent tokens of the custom accent at `hue` in `mode`, as hex (what the stylesheet means, in sRGB). */
export function customTokens(mode, hue) {
  const tone = (name) => {
    const [l, c] = customTone(mode, name);
    return oklchToHex({ l, c, h: hue });
  };
  return {
    "--osio-a-solid": tone("solid"),
    "--osio-a-hover": tone("hover"),
    "--osio-a-fg": FG[mode],
    "--osio-a-text": tone("text"),
    "--osio-a-subtle": tone("subtle"),
  };
}

/** Every token and alias of `palette` in `mode` with `accentTokens` laid over its own accent tones, resolved to literals. */
export const withAccent = (palette, mode, accentTokens) =>
  resolveTokens({ ...modeTokens(palette, mode), ...accentTokens }, aliasPinsOf(palette, mode));

const block = (selector, declarations) =>
  `${selector} {\n${declarations.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`;

const FIXED_ACCENT_PALETTES = PALETTES.filter((palette) => palette.contrast === "AAA").map((palette) => palette.id);

const selector = (id, mode) =>
  `:root[data-accent="${id}"][data-theme="${mode}"]${FIXED_ACCENT_PALETTES.map((fixed) => `:not([data-palette="${fixed}"])`).join("")}`;

function customDeclarations(mode) {
  const tone = (name) => {
    const [l, c] = customTone(mode, name);
    return `oklch(${l} ${c} var(--osio-accent-hue))`;
  };
  return [
    ["--osio-a-solid", tone("solid")],
    ["--osio-a-hover", tone("hover")],
    ["--osio-a-fg", FG[mode]],
    ["--osio-a-text", tone("text")],
    ["--osio-a-subtle", tone("subtle")],
  ];
}

const HEADER = `/* GENERATED by scripts/build-tokens.mjs from the seeds in scripts/tokens/accents.mjs.
   Do not edit: change the seeds, then run \`npm run tokens\`. */`;

/** The accent stylesheet: a block per non-default preset and mode, then the custom hue's. */
export function renderAccentStylesheet() {
  const presets = ACCENT_PRESETS.filter((preset) => preset.id !== DEFAULT_ACCENT).flatMap((preset) =>
    MODES.map((mode) => block(selector(preset.id, mode), Object.entries(presetTokens(preset.id, mode)))),
  );
  const custom = MODES.map((mode) => block(selector("custom", mode), customDeclarations(mode)));
  return `${[HEADER, ...presets, ...custom].join("\n\n")}\n`;
}

/** The picker's preset list as a TypeScript module: id, label and the light-mode swatch. */
export function renderAccentRegistry() {
  const swatch = (preset) =>
    preset.id === DEFAULT_ACCENT
      ? withAccent(PALETTES[0], "light", {})["--osio-accent"]
      : presetTokens(preset.id, "light")["--osio-a-solid"];
  const entries = ACCENT_PRESETS.map(
    (preset) => `  { id: ${JSON.stringify(preset.id)}, label: ${JSON.stringify(preset.label)}, swatch: ${JSON.stringify(swatch(preset))} },`,
  );
  return `/* GENERATED by scripts/build-tokens.mjs from the seeds in scripts/tokens/accents.mjs.
   Do not edit: change the seeds, then run \`npm run tokens\`. The CSS for these ids
   is in src/app/styles/accents.generated.css. */

import type { AccentMeta } from "./theme";

export const GENERATED_ACCENTS: readonly AccentMeta[] = [
${entries.join("\n")}
];

/** Palettes that keep their own accent: the accent presets and the custom hue do not apply over them. */
export const FIXED_ACCENT_PALETTES: readonly string[] = ${JSON.stringify(FIXED_ACCENT_PALETTES)};
`;
}

/** Every accent (each preset, and the custom hue at every whole degree) over every palette and mode that misses its contrast level, as readable strings. */
export function accentProblems() {
  const candidates = [
    ...ACCENT_PRESETS.filter((preset) => preset.id !== DEFAULT_ACCENT).map((preset) => [preset.id, (mode) => presetTokens(preset.id, mode)]),
    ...Array.from({ length: 360 }, (_, hue) => [`custom hue ${hue}`, (mode) => customTokens(mode, hue)]),
  ];
  const problems = [];
  for (const [name, tokensFor] of candidates) {
    for (const palette of PALETTES.filter((entry) => !FIXED_ACCENT_PALETTES.includes(entry.id))) {
      for (const mode of MODES) {
        const resolved = withAccent(palette, mode, tokensFor(mode));
        for (const { text, background, ratio, required } of contrastFailures(resolved, { level: "AA" })) {
          problems.push(`${name}/${palette.id}/${mode}: ${text} on ${background} is ${ratio}:1, needs ${required}:1`);
        }
      }
    }
  }
  return problems;
}
