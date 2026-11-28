// The surface axes (surface, elevation, borders) and the one-click styles that combine them:
// each falls back on its own, sits at its default with no <html> attribute, a style is ONE
// patch, the boot script in index.html knows exactly the values theme.ts does, and every
// consumer of --osio-overlay-bg is one the frosted rule covers (a consumer it misses must
// stay opaque, never translucent without blur).

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  BORDERS,
  DEFAULT_APPEARANCE,
  ELEVATIONS,
  SURFACES,
  applyAppearance,
  parseAppearance,
  updateAppearance,
} from "../../src/shared/config/theme.ts";
import { STYLE_PRESETS, activeStyleId } from "../../src/shared/config/stylePresets.ts";

const stored = (value: unknown) => parseAppearance(JSON.stringify(value));

function withRoot(run: (dataset: Record<string, string | undefined>) => void): void {
  const dataset: Record<string, string | undefined> = {};
  const root = { dataset, style: { setProperty() {}, removeProperty() {} } };
  const globals = globalThis as unknown as { document?: unknown };
  const previous = globals.document;
  globals.document = { documentElement: root };
  try {
    run(dataset);
  } finally {
    globals.document = previous;
  }
}

test("an unknown surface, depth or border falls back to its own default", () => {
  const value = stored({ surface: "metal", elevation: "sky-high", borders: "dotted", radius: "round" });
  assert.equal(value.surface, "solid");
  assert.equal(value.elevation, "default");
  assert.equal(value.borders, "default");
  assert.equal(value.radius, "round");
});

test("every listed value of the new axes round-trips", () => {
  for (const surface of SURFACES) assert.equal(stored({ surface }).surface, surface);
  for (const elevation of ELEVATIONS) assert.equal(stored({ elevation }).elevation, elevation);
  for (const borders of BORDERS) assert.equal(stored({ borders }).borders, borders);
});

test("the default carries no attribute and a choice carries exactly its own", () => {
  withRoot((dataset) => {
    applyAppearance({ ...DEFAULT_APPEARANCE, surface: "frosted", elevation: "deep", borders: "none" });
    assert.equal(dataset.surface, "frosted");
    assert.equal(dataset.elevation, "deep");
    assert.equal(dataset.borders, "none");
    applyAppearance(DEFAULT_APPEARANCE);
    assert.equal(dataset.surface, undefined);
    assert.equal(dataset.elevation, undefined);
    assert.equal(dataset.borders, undefined);
  });
});

test("a style is one patch that never touches accent, palette or density", () => {
  for (const preset of STYLE_PRESETS) {
    const keys = Object.keys(preset.patch);
    for (const forbidden of ["accent", "hue", "density", "uiScale", "motion"]) assert.ok(!keys.includes(forbidden), `${preset.id} sets ${forbidden}`);
  }
  withRoot(() => {
    applyAppearance({ ...DEFAULT_APPEARANCE, accent: "ember", density: "compact" });
    const frost = STYLE_PRESETS.find((preset) => preset.id === "frost");
    assert.ok(frost);
    const next = updateAppearance(frost.patch);
    assert.equal(next.surface, "frosted");
    assert.equal(next.accent, "ember");
    assert.equal(next.density, "compact");
  });
});

test("the active style is derived: every field of the preset matches, otherwise none", () => {
  assert.equal(activeStyleId(DEFAULT_APPEARANCE), "calm");
  for (const preset of STYLE_PRESETS) assert.equal(activeStyleId({ ...DEFAULT_APPEARANCE, ...preset.patch }), preset.id);
  assert.equal(activeStyleId({ ...DEFAULT_APPEARANCE, elevation: "deep" }), null);
  assert.equal(activeStyleId({ ...DEFAULT_APPEARANCE, accent: "ember", ...STYLE_PRESETS[1].patch }), STYLE_PRESETS[1].id);
});

test("index.html boots exactly the values theme.ts accepts for the surface axes", () => {
  const html = readFileSync("index.html", "utf8");
  const table = /var axes = \{([\s\S]*?)\};/.exec(html)?.[1] ?? "";
  const listed = (axis: string) => [...(new RegExp(`${axis}:\\s*\\[([^\\]]*)\\]`).exec(table)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const nonDefault = (all: readonly string[], fallback: string) => all.filter((value) => value !== fallback);
  assert.deepEqual(listed("surface"), nonDefault(SURFACES, DEFAULT_APPEARANCE.surface));
  assert.deepEqual(listed("elevation"), nonDefault(ELEVATIONS, DEFAULT_APPEARANCE.elevation));
  assert.deepEqual(listed("borders"), nonDefault(BORDERS, DEFAULT_APPEARANCE.borders));
});

const COVERED = ["bg-[var(--osio-overlay-bg)]", "osio-surface-overlay"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "coverage" || name === "dist") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css|scss)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** The CSS rule that owns a line: the nearest selector or @utility line above it. */
function ownerOf(lines: string[], index: number): string {
  for (let at = index; at >= 0; at -= 1) if (/\{\s*$/.test(lines[at])) return lines[at];
  return "";
}

test("every consumer of --osio-overlay-bg is a spelling the frosted rule covers", () => {
  const strays: string[] = [];
  for (const file of [...sources("src"), ...sources("packages/osionos-ui/src")]) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("osio-overlay-bg")) return;
      if (/--osio-overlay-bg\s*:/.test(line)) return;
      if (line.includes(COVERED[0])) return;
      if (file.endsWith("recipes.css") && ownerOf(lines, index).includes("osio-surface-overlay")) return;
      if (file.endsWith("surface.css")) return;
      strays.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(strays, []);
});

test("the frosted rule names both covered spellings and ships translucency with its blur", () => {
  const css = readFileSync("src/app/styles/surface.css", "utf8");
  const rule = /:root:not\(\[data-density="compact"\]\):is\(\[data-surface="frosted"\], \[data-surface="glass"\]\) :where\((.*)\)\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, "frosted rule missing");
  assert.ok(rule[1].includes(".osio-surface-overlay") && rule[1].includes(`[class*="${COVERED[0]}"]`));
  assert.match(rule[2], /background-color:\s*color-mix/);
  assert.match(rule[2], /backdrop-filter:\s*blur/);
  assert.ok(!/--osio-overlay-bg\s*:\s*color-mix/.test(css), "the token itself must stay solid");
});

test("every frosted rule is desktop-only and outside compact density, fallback included", () => {
  const css = readFileSync("src/app/styles/surface.css", "utf8");
  const frosted = css.slice(css.indexOf("@media (width > 767.98px) {\n  @supports"));
  assert.ok(frosted.startsWith("@media (width > 767.98px)"), "frosted block must sit in the desktop media query");
  const selectors = frosted.match(/^\s*:root[^{]*:is\(\[data-surface="frosted"\][^{]*\{/gm) ?? [];
  assert.equal(selectors.length, 2);
  for (const selector of selectors) assert.ok(selector.includes(':not([data-density="compact"])'), selector);
  assert.equal(css.match(/data-surface="frosted"/g)?.length, 2, "no frosted rule outside the guarded block");
});

test("a later corner tweak keeps the preset; a mixed surface axis is Custom", () => {
  for (const preset of STYLE_PRESETS) assert.equal(activeStyleId({ ...DEFAULT_APPEARANCE, ...preset.patch, radius: preset.id === "paper" ? "round" : "sharp" }), preset.id);
  assert.ok(STYLE_PRESETS.every((preset) => preset.patch.radius !== undefined));
  assert.equal(activeStyleId({ ...DEFAULT_APPEARANCE, borders: "strong" }), null);
});

test("the selected style carries a non-colour cue that survives forced colours", () => {
  const tsx = readFileSync("src/features/theme/StyleControls.tsx", "utf8");
  assert.match(tsx, /peer-checked:\[&_svg\]:block/);
  assert.match(tsx, /<svg aria-hidden="true"/);
});

test("glass parses, is not the default, and Aurora is one patch that activeStyleId finds", () => {
  assert.ok(SURFACES.includes("glass"));
  assert.equal(stored({ surface: "glass" }).surface, "glass");
  assert.equal(DEFAULT_APPEARANCE.surface, "solid");
  const aurora = STYLE_PRESETS.find((preset) => preset.id === "aurora");
  assert.ok(aurora);
  assert.deepEqual(aurora.patch, { surface: "glass", elevation: "deep", borders: "none", radius: "round" });
  assert.equal(activeStyleId({ ...DEFAULT_APPEARANCE, ...aurora.patch }), "aurora");
  withRoot((dataset) => {
    assert.equal(updateAppearance(aurora.patch).surface, "glass");
    assert.equal(dataset.surface, "glass");
  });
});

test("the boot table lists glass and only glass and frosted for the surface axis", () => {
  const html = readFileSync("index.html", "utf8");
  assert.match(html, /surface:\s*\['frosted', 'glass'\]/);
});

test("glass: the aurora sits on the shell hook, the card is translucent without a blur, fallbacks restore solid", () => {
  const css = readFileSync("src/app/styles/surface.css", "utf8");
  assert.match(css, /\[data-surface="glass"\] \[data-osio-shell\] \{\s*background:\s*radial-gradient/);
  assert.ok(!/animation|background-attachment/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "aurora is static");
  const card = /\[data-osio-sidebar-card\] \{\s*background-color:\s*color-mix\(in srgb, var\(--osio-bg-surface\) 76%, transparent\);\s*\}/.exec(css);
  assert.ok(card, "the card rule sets only background-color");
  assert.ok(!/--osio-bg-surface\s*:/.test(css), "the surface token itself stays opaque");
  assert.equal(css.match(/data-surface="glass"\][^{]*\[data-osio-sidebar-card\]/g)?.length, 2, "card rule plus its fallback");
  assert.ok(/aside:not\(\[data-sidebar-mode="peek"\]\) \[data-osio-sidebar-card\]/.test(css), "peek stays opaque");
  const cardRules = css.slice(css.indexOf("Glass edge")).split("}").filter((r) => r.includes("data-osio-sidebar-card"));
  for (const rule of cardRules) assert.ok(!/backdrop-filter/.test(rule), rule);
  const shell = readFileSync("src/app/SignedInApp.tsx", "utf8");
  assert.match(shell, /data-osio-shell/);
});
