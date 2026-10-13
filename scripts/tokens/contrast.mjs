// The readability gate: every pair of text colour and background the app
// actually combines must reach WCAG 2 AA for body text (4.5:1). A palette that
// asks for AAA (7:1) must reach it for body text and for text on the accent,
// the pairs a person reads for long; its other pairs stay at AA.
//
// Ponytail: the pairs are a hand-kept list of the combinations components use,
// not something derived from the components. A new combination (muted text on
// a tinted block, say) is unchecked until it is added here. Borders are left
// out on purpose: the hairlines are decoration at about 1.3:1, and no control
// relies on its border alone to be found.

import { contrastRatio } from "./oklch.mjs";

const AA_TEXT = 4.5;
const AAA_TEXT = 7;

const SURFACES = ["canvas", "surface", "page", "subtle", "muted", "hover", "elevated"].map((name) => `--osio-bg-${name}`);
const TEXT = ["fg-default", "fg-strong", "fg-muted", "fg-subtle", "accent-text", "link-hover", "danger", "success", "warning"];
const TINTS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

const pair = (text, background, strict = false) => ({
  text: `--osio-${text}`,
  background: `--osio-${background}`,
  ratio: AA_TEXT,
  strict,
});

const BODY_TEXT = new Set(["fg-default", "fg-strong"]);

export const CONTRAST_PAIRS = [
  ...TEXT.flatMap((text) =>
    SURFACES.map((background) => ({ text: `--osio-${text}`, background, ratio: AA_TEXT, strict: BODY_TEXT.has(text) })),
  ),
  pair("accent-fg", "accent", true),
  pair("accent-fg", "accent-hover"),
  pair("update-fg", "update"),
  pair("update-fg", "update-hover"),
  pair("accent-text", "accent-subtle"),
  pair("fg-default", "accent-subtle"),
  pair("danger-fg", "danger"),
  pair("danger-fg", "danger-hover"),
  pair("success-fg", "success"),
  pair("success-fg", "success-hover"),
  pair("warning-fg", "warning"),
  ...TINTS.flatMap((tint) => [
    pair(`block-tint-${tint}-fg`, `block-tint-${tint}-bg`),
    pair(`block-tint-${tint}-fg`, "bg-surface"),
    pair(`block-tint-${tint}-fg`, "bg-page"),
  ]),
];

/**
 * The pairs of `tokens` (name → "#RRGGBB") below their ratio, as { text, background, ratio, required }; throws on a
 * pair naming an undefined token. `level` "AAA" raises the strict pairs to 7:1.
 */
export function contrastFailures(tokens, { level = "AA" } = {}) {
  if (level !== "AA" && level !== "AAA") throw new Error(`unknown contrast level "${level}"`);
  const failures = [];
  for (const { text, background, ratio, strict } of CONTRAST_PAIRS) {
    for (const name of [text, background]) {
      if (!(name in tokens)) throw new Error(`contrast pair names ${name}, which the palette does not define`);
    }
    const required = level === "AAA" && strict ? AAA_TEXT : ratio;
    const measured = Math.round(contrastRatio(tokens[text], tokens[background]) * 100) / 100;
    if (measured < required) failures.push({ text, background, ratio: measured, required });
  }
  return failures;
}
