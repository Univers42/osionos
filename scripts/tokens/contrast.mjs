// The readability gate: every pair of text colour and background the app
// actually combines must reach WCAG 2 AA for body text (4.5:1).
//
// Ponytail: the pairs are a hand-kept list of the combinations components use,
// not something derived from the components. A new combination (muted text on
// a tinted block, say) is unchecked until it is added here. Borders are left
// out on purpose: the hairlines are decoration at about 1.3:1, and no control
// relies on its border alone to be found.

import { contrastRatio } from "./oklch.mjs";

const AA_TEXT = 4.5;

const SURFACES = ["canvas", "surface", "page", "subtle", "muted", "hover", "elevated"].map((name) => `--osio-bg-${name}`);
const TEXT = ["fg-default", "fg-strong", "fg-muted", "fg-subtle", "accent-text", "link-hover", "danger", "success", "warning"];
const TINTS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

const pair = (text, background) => ({ text: `--osio-${text}`, background: `--osio-${background}`, ratio: AA_TEXT });

export const CONTRAST_PAIRS = [
  ...TEXT.flatMap((text) => SURFACES.map((background) => ({ text: `--osio-${text}`, background, ratio: AA_TEXT }))),
  pair("accent-fg", "accent"),
  pair("accent-fg", "accent-hover"),
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

/** The pairs of `tokens` (name → "#RRGGBB") below their ratio, as { text, background, ratio, required }; throws on a pair naming an undefined token. */
export function contrastFailures(tokens) {
  const failures = [];
  for (const { text, background, ratio: required } of CONTRAST_PAIRS) {
    for (const name of [text, background]) {
      if (!(name in tokens)) throw new Error(`contrast pair names ${name}, which the palette does not define`);
    }
    const ratio = Math.round(contrastRatio(tokens[text], tokens[background]) * 100) / 100;
    if (ratio < required) failures.push({ text, background, ratio, required });
  }
  return failures;
}
