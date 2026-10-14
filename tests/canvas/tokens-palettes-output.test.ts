// What the generator writes: the stylesheet and the registry are complete for
// every palette, shadows follow the palette, and pins behave as documented.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { resolvedTokens, resolveTokens } from "../../scripts/tokens/aliases.mjs";
import { contrastFailures } from "../../scripts/tokens/contrast.mjs";
import { contrastRatio, hexToOklch } from "../../scripts/tokens/oklch.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { modeTokens } from "../../scripts/tokens/ramps.mjs";
import { GENERATED_REGISTRY, renderRegistry } from "../../scripts/tokens/registry.mjs";
import { GENERATED_STYLESHEET } from "../../scripts/tokens/stylesheet.mjs";
import { malformedTokens } from "../../scripts/tokens/validity.mjs";
import { GENERATED_PALETTES } from "../../src/shared/config/palettes.generated.ts";
import { PALETTES as PICKER_PALETTES } from "../../src/shared/config/theme.ts";
import { APP_ROOT, blocksOf, readAppFile } from "./tokens-css.ts";

const defaultPalette = PALETTES[0];
const resolved = (mode: string) => resolvedTokens(defaultPalette, mode);
const idOf = (palette: { id: string }) => palette.id;
const paletteById = (id: string) => PALETTES.find((palette: { id: string }) => idOf(palette) === id);

test("the registry entry for the default palette carries its swatches, id and label", () => {
  const light = resolved("light");
  const warm = PICKER_PALETTES.find((palette: { id: string }) => idOf(palette) === defaultPalette.id);
  assert.deepEqual(warm.swatches, [
    light["--osio-bg-canvas"],
    light["--osio-bg-surface"],
    light["--osio-accent"],
    light["--osio-fg-default"],
  ]);
  assert.equal(warm.label, defaultPalette.label);
});

test("the committed palette registry is what the seeds generate, and the picker lists exactly it", () => {
  assert.equal(readAppFile(GENERATED_REGISTRY), renderRegistry());
  assert.deepEqual(PICKER_PALETTES, GENERATED_PALETTES);
  assert.deepEqual(PICKER_PALETTES.map(idOf), PALETTES.map(idOf));
});

test("the picker's palette ids are the CSS's [data-palette] ids, the default having none", () => {
  const css = readAppFile(GENERATED_STYLESHEET);
  const cssIds = [...new Set([...css.matchAll(/\[data-palette="([\w-]+)"\]/g)].map(([, id]) => id))];
  assert.deepEqual(
    PICKER_PALETTES.map(idOf).filter((id: string) => id !== defaultPalette.id),
    cssIds,
  );
  assert.ok(!css.includes(`[data-palette="${defaultPalette.id}"]`));
  assert.deepEqual(PALETTES.map(idOf), [
    "warm", "mono", "contrast", "maximal", "nord", "solarized", "midnight", "rose", "ember",
  ]);
});

// A block that leaned on the default for a token would show the default's
// colour inside another palette: Nord's graph in brown, its shadows in warm.
test("every other palette's block defines every token the default palette's block does", () => {
  const blocks = blocksOf(readAppFile(GENERATED_STYLESHEET), /^(:root, \[data-theme="light"\]|\[data-theme="dark"\]|\[data-palette="[\w-]+"\]\[data-theme="(light|dark)"\])$/);
  for (const mode of MODES) {
    const defaults = Object.keys(blocks.get(mode === "light" ? ':root, [data-theme="light"]' : '[data-theme="dark"]') ?? {});
    assert.ok(defaults.length > 0);
    for (const palette of PALETTES.slice(1)) {
      const own = Object.keys(blocks.get(`[data-palette="${palette.id}"][data-theme="${mode}"]`) ?? {});
      assert.deepEqual(defaults.filter((name) => !own.includes(name)), [], `${palette.id}/${mode}`);
    }
  }
});

test("a palette's block carries its pinned public names, which beat the alias block by specificity", () => {
  const nordDark = blocksOf(readAppFile(GENERATED_STYLESHEET), /^\[data-palette="nord"\]\[data-theme="dark"\]$/).values().next().value;
  assert.match(nordDark["--osio-syntax-string"], /^#[0-9A-F]{6}$/);
  assert.notEqual(nordDark["--osio-syntax-string"], resolved("dark")["--osio-syntax-string"]);
});

test("the contrast palette reaches AAA on body text and on text over the accent", () => {
  const palette = paletteById("contrast");
  assert.equal(palette.contrast, "AAA");
  for (const mode of MODES) {
    const tokens = resolvedTokens(palette, mode);
    for (const surface of ["canvas", "surface", "page", "subtle", "muted", "hover", "elevated"]) {
      for (const text of ["fg-default", "fg-strong"]) {
        assert.ok(contrastRatio(tokens[`--osio-${text}`], tokens[`--osio-bg-${surface}`]) >= 7, `${mode} ${text} on ${surface}`);
      }
    }
    assert.ok(contrastRatio(tokens["--osio-accent-fg"], tokens["--osio-accent"]) >= 7, `${mode} accent-fg`);
  }
});

test("the AAA level asks more than AA", () => {
  const mid = { ...resolved("light"), "--osio-fg-default": "#666666" };
  assert.deepEqual(contrastFailures(mid).filter((failure: { text: string }) => failure.text === "--osio-fg-default"), []);
  const strict = contrastFailures(mid, { level: "AAA" }).filter((failure: { text: string }) => failure.text === "--osio-fg-default");
  assert.ok(strict.length > 0 && strict.every((failure: { required: number }) => failure.required === 7));
  assert.throws(() => contrastFailures(mid, { level: "AAAA" }), /unknown contrast level/);
});

test("ember is the terracotta palette, readable, and does not replace the default", () => {
  const ember = paletteById("ember");
  assert.ok(ember, "ember is a palette");
  assert.equal(ember.label, "Ember");
  assert.equal(ember.signatureMode, "light");
  assert.notEqual(ember.id, defaultPalette.id);
  for (const mode of MODES) {
    const accent = hexToOklch(resolvedTokens(ember, mode)["--osio-accent"]);
    assert.ok(accent.h >= 30 && accent.h <= 50, `${mode} accent hue ${accent.h.toFixed(1)}`);
    assert.deepEqual(contrastFailures(resolvedTokens(ember, mode)), []);
  }
});

// The graph and the shadows used to be the default palette's browns in every
// palette. A different neutral hue has to reach them.
test("a cool palette gets its own shadows, scrim and graph chrome", () => {
  const nord = paletteById("nord");
  for (const mode of MODES) {
    const cool = modeTokens(nord, mode);
    const warm = modeTokens(defaultPalette, mode);
    for (const name of ["--osio-graph-bg-1", "--osio-graph-edge", "--osio-graph-halo", "--osio-graph-edge-note", "--osio-graph-edge-tag", "--osio-graph-edge-hier", "--osio-block-tint-blue-bg"]) {
      assert.notEqual(cool[name], warm[name], `${mode} ${name}`);
    }
  }
  assert.notEqual(modeTokens(nord, "light")["--osio-overlay"], modeTokens(defaultPalette, "light")["--osio-overlay"]);
  assert.notEqual(modeTokens(nord, "light")["--osio-shadow-rgb"], modeTokens(defaultPalette, "light")["--osio-shadow-rgb"]);
  assert.equal(modeTokens(nord, "dark")["--osio-shadow-rgb"], "0 0 0");
});

test("the default palette's shadow tint stays the warm brown it always was", () => {
  const [red, green, blue] = modeTokens(defaultPalette, "light")["--osio-shadow-rgb"].split(" ").map(Number);
  for (const [actual, expected] of [[red, 40], [green, 33], [blue, 24]]) assert.ok(Math.abs(actual - expected) <= 3, `${actual} vs ${expected}`);
});

// The effective colour of an "rgba(r, g, b, a)" ink laid over a "#RRGGBB" page, per channel.
function blended(ink: string, page: string) {
  const [red, green, blue, alpha] = ink.match(/[\d.]+/g)!.map(Number);
  const base = [1, 3, 5].map((start) => Number.parseInt(page.slice(start, start + 2), 16));
  return [red, green, blue].map((channel, index) => alpha * channel + (1 - alpha) * base[index]);
}

test("the default palette's graph chrome stays close to what was hand-written", () => {
  const light = modeTokens(defaultPalette, "light");
  assert.equal(light["--osio-graph-bg-1"], "#F2F0EC");
  assert.equal(light["--osio-graph-edge-hier"], "rgba(122, 74, 44, 0.62)");
  assert.equal(modeTokens(defaultPalette, "dark")["--osio-graph-edge"], "rgba(168, 163, 153, 0.26)");
  const edge = blended(light["--osio-graph-edge"], "#F3F0E7");
  const wasEdge = blended("rgba(74, 66, 53, 0.28)", "#F3F0E7");
  edge.forEach((channel, index) => assert.ok(Math.abs(channel - wasEdge[index]) <= 5, `light edge channel ${index}: ${channel} vs ${wasEdge[index]}`));
  assert.equal(light["--osio-overlay"], "rgba(27, 26, 24, 0.42)");
});

// A hierarchy edge that is the same brown in every palette is the default
// palette's graph showing through: it has to take the palette's neutral hue.
test("hierarchy and tag edges follow each palette's neutral hue, and stay grey in a grey palette", () => {
  for (const mode of MODES) {
    const seen = new Map<string, string>();
    for (const palette of PALETTES) {
      const edge = modeTokens(palette, mode)["--osio-graph-edge-hier"];
      const [red, green, blue] = edge.match(/[\d.]+/g)!.map(Number);
      if (palette.neutral.chroma === 0) assert.ok(Math.max(red, green, blue) - Math.min(red, green, blue) <= 2, `${palette.id}/${mode} ${edge}`);
      seen.set(palette.neutral.hue + ":" + palette.neutral.chroma, edge);
    }
    const distinctNeutrals = new Set(PALETTES.map((palette: { neutral: { hue: number; chroma: number } }) => `${palette.neutral.hue}:${palette.neutral.chroma}`));
    assert.equal(new Set(seen.values()).size, distinctNeutrals.size, `${mode}: one hierarchy edge per distinct neutral`);
  }
});

// Both palettes were hand-tuned to a hue; the pins keep it. Only the colours
// the contrast gate forces may move.
test("monochrome and maximal keep their hand-written light text colours", () => {
  const mono = resolvedTokens(paletteById("mono"), "light");
  assert.deepEqual([mono["--osio-fg-default"], mono["--osio-fg-strong"], mono["--osio-fg-muted"]], ["#0A0A0A", "#000000", "#565656"]);
  const maximal = resolvedTokens(paletteById("maximal"), "light");
  assert.deepEqual([maximal["--osio-fg-default"], maximal["--osio-fg-strong"], maximal["--osio-fg-muted"]], ["#1A1422", "#120D1A", "#645A7A"]);
});

test("every elevation and cell shadow is tinted by --osio-shadow-rgb in every mode, never a literal", () => {
  const blocks = blocksOf(readAppFile("src/app/styles/global.css"), /^(:root|\[data-theme="(light|dark)"\])/);
  const shadowName = /^--osio-(e[1-5]|shadow-(sm|menu|modal|cell|cell-selected))$/;
  let checked = 0;
  for (const [selector, block] of blocks) {
    for (const [name, value] of Object.entries(block)) {
      if (!shadowName.test(name)) continue;
      checked += 1;
      assert.match(value, /rgb\(var\(--osio-shadow-rgb\) \/ [\d.]+\)/, `${selector} ${name}`);
      assert.doesNotMatch(value, /rgba\(/, `${selector} ${name}`);
    }
  }
  assert.ok(checked >= 20, `found ${checked} shadow declarations across the light and dark blocks`);
});

test("pins override generated values and aliases, and what is derived from them follows", () => {
  const navy = { ...defaultPalette, pins: { light: { "--osio-a-solid": "#0B3D91", "--osio-syntax-string": "#112233" }, dark: {} } };
  const yellow = { ...defaultPalette, pins: { light: { "--osio-a-solid": "#FFD400" }, dark: {} } };
  assert.equal(modeTokens(navy, "light")["--osio-a-fg"], "#FFFFFF");
  assert.notEqual(modeTokens(yellow, "light")["--osio-a-fg"], "#FFFFFF");
  assert.equal(modeTokens(navy, "light")["--osio-graph-edge-note"], "rgba(11, 61, 145, 0.5)");
  const tokens = resolvedTokens(navy, "light");
  assert.equal(tokens["--osio-syntax-string"], "#112233");
  assert.equal(tokens["--osio-accent"], "#0B3D91");
  assert.equal(tokens["--osio-update"], "#0B3D91");
  const pinnedAccent = resolveTokens({ ...modeTokens(defaultPalette, "light") }, { "--osio-accent": "#123456" });
  assert.equal(pinnedAccent["--osio-update"], "#123456", "an alias of a pinned alias follows the pin");
});

test("a pin naming nothing the generator knows is an error, not silently ignored", () => {
  assert.throws(() => resolveTokens(modeTokens(defaultPalette, "light"), { "--osio-not-a-token": "#000000" }), /--osio-not-a-token/);
  assert.throws(() => resolvedTokens({ ...defaultPalette, pins: { light: { "--osio-nope": "#000000" }, dark: {} } }, "light"), /--osio-nope/);
});

test("the shape check passes script-readable literals and flags everything else", () => {
  const good = { "--a": "#0B3D91", "--b": "rgba(1, 2, 3, 0.5)", "--c": "rgba(1, 2, 3, 1)", "--osio-shadow-rgb": "40 33 24" };
  assert.deepEqual(malformedTokens(good), []);
  const bad = { "--a": "oklch(0.5 0.1 200)", "--b": "var(--x)", "--c": "#abc", "--d": "rgba(300, 0, 0, 0.5)", "--osio-shadow-rgb": "300 0 0" };
  assert.deepEqual(malformedTokens(bad).map(([name]: [string]) => name), ["--a", "--b", "--c", "--d", "--osio-shadow-rgb"]);
});

test("build-tokens --check passes on the committed files", () => {
  const output = execFileSync("node", ["scripts/build-tokens.mjs", "--check"], { cwd: APP_ROOT, encoding: "utf8" });
  assert.match(output, /colour tokens/);
});
