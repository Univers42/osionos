#!/usr/bin/env node
// Generates the app's colour tokens from the seeds in scripts/tokens/palettes.mjs.
//
//   node scripts/build-tokens.mjs           write every generated file
//   node scripts/build-tokens.mjs --check   fail if a committed file is stale,
//                                           a palette fails its contrast level,
//                                           a value is not a usable colour, or
//                                           the vendored database declares a
//                                           colour the bridge does not map
//
// Run from the app's root. Both forms refuse a palette that fails contrast, so
// an unreadable colour can be neither written nor committed.

import { readFileSync, writeFileSync } from "node:fs";

import { resolvedTokens } from "./tokens/aliases.mjs";
import { contrastFailures } from "./tokens/contrast.mjs";
import { BRIDGE_STYLESHEET, renderBridge, VENDORED_THEME } from "./tokens/databaseBridge.mjs";
import { MODES, PALETTES } from "./tokens/palettes.mjs";
import { GENERATED_REGISTRY, renderRegistry } from "./tokens/registry.mjs";
import { GENERATED_STYLESHEET, renderStylesheet } from "./tokens/stylesheet.mjs";
import { malformedTokens } from "./tokens/validity.mjs";

function reportProblems() {
  let failed = 0;
  for (const palette of PALETTES) {
    const level = palette.contrast ?? "AA";
    for (const mode of MODES) {
      const tokens = resolvedTokens(palette, mode);
      for (const { text, background, ratio, required } of contrastFailures(tokens, { level })) {
        console.error(`✗ ${palette.id}/${mode}: ${text} on ${background} is ${ratio}:1, needs ${required}:1`);
        failed += 1;
      }
      for (const [name, value] of malformedTokens(tokens)) {
        console.error(`✗ ${palette.id}/${mode}: ${name} is "${value}", not a colour a script can read`);
        failed += 1;
      }
    }
  }
  return failed;
}

function isCommitted({ path, render }) {
  try {
    return readFileSync(path, "utf8") === render();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

if (reportProblems() > 0) {
  console.error("\nA palette is unreadable or malformed. Change the seed, the pins or the tone table in scripts/tokens/.");
  process.exit(1);
}

// The database bridge is generated from the vendored theme, so a vendored
// colour the table does not map fails the run instead of escaping the palette.
const bridge = renderBridge(readFileSync(VENDORED_THEME, "utf8"));
if (bridge.unmapped.length > 0) {
  console.error(`✗ ${VENDORED_THEME} declares colours the database bridge does not map:\n  ${bridge.unmapped.join("\n  ")}`);
  console.error("\nMap each in the ROLES table of scripts/tokens/databaseBridge.mjs.");
  process.exit(1);
}

const OUTPUTS = [
  { path: GENERATED_STYLESHEET, render: renderStylesheet },
  { path: GENERATED_REGISTRY, render: renderRegistry },
  { path: BRIDGE_STYLESHEET, render: () => bridge.css },
];

if (!process.argv.includes("--check")) {
  for (const output of OUTPUTS) {
    writeFileSync(output.path, output.render());
    console.log(`✓ wrote ${output.path}`);
  }
} else {
  const stale = OUTPUTS.filter((output) => !isCommitted(output));
  for (const { path } of stale) console.error(`✗ ${path} is not what the seeds generate. Run \`npm run tokens\` and commit the result.`);
  if (stale.length > 0) process.exit(1);
  console.log(`✓ colour tokens: ${OUTPUTS.length} generated files match their seeds; ${PALETTES.length} palettes pass their contrast level.`);
}
