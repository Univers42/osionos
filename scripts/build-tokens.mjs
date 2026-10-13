#!/usr/bin/env node
// Generates the app's colour tokens from the seeds in scripts/tokens/palettes.mjs.
//
//   node scripts/build-tokens.mjs           write the stylesheet
//   node scripts/build-tokens.mjs --check   fail if the committed stylesheet is
//                                           stale, or a palette fails contrast
//
// Run from the app's root. Both forms refuse a palette that fails contrast, so
// an unreadable colour can be neither written nor committed.

import { readFileSync, writeFileSync } from "node:fs";

import { resolveTokens } from "./tokens/aliases.mjs";
import { contrastFailures } from "./tokens/contrast.mjs";
import { MODES, PALETTES } from "./tokens/palettes.mjs";
import { modeTokens } from "./tokens/ramps.mjs";
import { GENERATED_STYLESHEET, renderStylesheet } from "./tokens/stylesheet.mjs";

function reportContrast() {
  let failed = 0;
  for (const palette of PALETTES) {
    for (const mode of MODES) {
      for (const { text, background, ratio, required } of contrastFailures(resolveTokens(modeTokens(palette, mode)))) {
        console.error(`✗ ${palette.id}/${mode}: ${text} on ${background} is ${ratio}:1, needs ${required}:1`);
        failed += 1;
      }
    }
  }
  return failed;
}

function isCommitted(stylesheet) {
  try {
    return readFileSync(GENERATED_STYLESHEET, "utf8") === stylesheet;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

if (reportContrast() > 0) {
  console.error("\nA text colour is too close to its background. Change the seed or the tone table in scripts/tokens/.");
  process.exit(1);
}

const stylesheet = renderStylesheet();
if (!process.argv.includes("--check")) {
  writeFileSync(GENERATED_STYLESHEET, stylesheet);
  console.log(`✓ wrote ${GENERATED_STYLESHEET}`);
} else if (isCommitted(stylesheet)) {
  console.log(`✓ colour tokens: ${GENERATED_STYLESHEET} matches its seeds and every contrast pair passes AA.`);
} else {
  console.error(`✗ ${GENERATED_STYLESHEET} is not what the seeds generate. Run \`npm run tokens\` and commit the result.`);
  process.exit(1);
}
