/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-shipped.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The themes osionos ships are examples people copy, so each one must be
// valid against the catalog and readable: every text pair the contrast check
// watches is AA (4.5:1) or better, computed from the theme's own hex values,
// and success and warning keep the hue people read them by.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { CODE_CONTRAST_PAIRS, CONTRAST_PAIRS, contrastRatio, parseHexColor } from "../../src/shared/config/themeContrast.ts";
import { resolvedTokens } from "../../scripts/tokens/aliases.mjs";
import { PALETTES } from "../../scripts/tokens/palettes.mjs";
import { parseThemeDoc, type ThemeDoc } from "../../src/shared/config/themeDoc.ts";
import { SHIPPED_THEMES, isShippedThemeName } from "../../src/shared/config/themes/index.ts";
import { AMBER_HUE, GREEN_HUE, hueOfHex, withinHue } from "./hue-ranges.ts";

const DIR = new URL("../../src/shared/config/themes/", import.meta.url);
const files = readdirSync(DIR).filter((name) => name.endsWith(".json"));
const themes = files.map((name) => ({ name, raw: JSON.parse(readFileSync(new URL(name, DIR), "utf8")) as ThemeDoc }));

test("contrast follows WCAG 2 relative luminance", () => {
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-9);
  assert.equal(contrastRatio([255, 255, 255], [0, 0, 0]), contrastRatio([0, 0, 0], [255, 255, 255]));
  const grey = contrastRatio(parseHexColor("#777") ?? [0, 0, 0], parseHexColor("#fff") ?? [0, 0, 0]);
  assert.ok(Math.abs(grey - 4.48) < 0.01, String(grey));
  assert.deepEqual(parseHexColor("#0f1520"), [15, 21, 32]);
  assert.equal(parseHexColor("rgb(0 0 0)"), null);
});

test("osionos ships every theme file, and nothing else", () => {
  assert.deepEqual(SHIPPED_THEMES.map((theme) => theme.name).sort(), themes.map((theme) => theme.raw.name).sort());
  assert.equal(isShippedThemeName("meadow"), true);
  assert.equal(isShippedThemeName("My theme"), false);
});

// A theme that does not set the Update button's colours gets the accent's (aliases.mjs, held by tokens-palettes.test.ts).
const INHERITED_FROM_ACCENT: Record<string, string> = { update: "accent", "update-hover": "accent-hover", "update-fg": "accent-fg" };
const themeSets = (colors: Record<string, string>, token: string) => colors[token] ?? colors[INHERITED_FROM_ACCENT[token]];

// The older hand-made themes set only part of the status colours and inherit the rest from their base
// palette. A pair is checked on the theme's own values, filling the end it did not set from the base
// palette; a pair whose two ends it sets neither of belongs to the base, which tokens-palettes.test.ts holds.
function pairColours(theme: ThemeDoc, fg: string, bg: string): [string, string] | null {
  const colors = theme.colors ?? {};
  // Neither end is the theme's own: the base palette's pair, already held by tokens-palettes.test.ts.
  if (themeSets(colors, fg) === undefined && themeSets(colors, bg) === undefined) return null;
  const base = resolvedTokens(PALETTES[0], theme.base);
  return [themeSets(colors, fg) ?? base[`--osio-${fg}`], themeSets(colors, bg) ?? base[`--osio-${bg}`]];
}

for (const { name, raw } of themes) {
  test(`${name} is a valid theme with every checked pair at AA or better`, () => {
    const { doc, issues } = parseThemeDoc(raw);
    assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
    assert.ok(doc?.base, "sets base");
    const colors = doc?.colors ?? {};
    const total = Object.keys(colors).length + Object.keys(doc?.layout ?? {}).length + Object.keys(doc?.fonts ?? {}).length;
    assert.ok(total >= 20, `${total} keys`);
    for (const [fg, bg] of CONTRAST_PAIRS) {
      const resolved = pairColours(raw, fg, bg);
      if (!resolved) continue; // base palette pair: tokens-palettes.test.ts holds it
      const front = parseHexColor(resolved[0]);
      const back = parseHexColor(resolved[1]);
      assert.ok(front && back, `${fg} and ${bg} are set in hex`);
      const ratio = contrastRatio(front, back);
      assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}`);
    }
  });
}

test("each theme shows off the part of the format it is named for", () => {
  const byName = new Map(themes.map((theme) => [theme.raw.name, theme.raw]));
  assert.ok(byName.get("Graphite Compact")?.layout?.["control-h-md"] && byName.get("Graphite Compact")?.layout?.radius);
  assert.ok(byName.get("High Contrast")?.layout?.["focus-ring-width"]);
  assert.ok(byName.get("Meadow")?.layout?.["page-max-width"]);
  const paper = byName.get("Studio Paper")?.fonts ?? {};
  assert.ok(paper["font-family-serif"] || paper["font-family-sans"]);
});

for (const { name, raw } of themes) {
  test(`${name}: code text is AA wherever the theme sets both colours`, () => {
    const colors = raw.colors ?? {};
    for (const [fg, bg] of CODE_CONTRAST_PAIRS) {
      const [front, back] = [parseHexColor(colors[fg] ?? ""), parseHexColor(colors[bg] ?? "")];
      if (!front || !back) continue;
      assert.ok(contrastRatio(front, back) >= 4.5, `${fg} on ${bg} is ${contrastRatio(front, back).toFixed(2)}`);
    }
  });
}

for (const { name, raw } of themes) {
  test(`${name}: success reads green and warning reads amber`, () => {
    const colors = raw.colors ?? {};
    for (const [token, range] of [["success", GREEN_HUE], ["warning", AMBER_HUE]] as const) {
      if (colors[token] === undefined) continue;
      const hue = hueOfHex(colors[token]);
      assert.ok(withinHue(hue, range), `${token} ${colors[token]} has hue ${hue?.toFixed(0)}, wanted ${range[0]}-${range[1]}`);
    }
  });
}
