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

// The five themes osionos ships are examples people copy, so each one must be
// valid against the catalog and readable: every text pair the contrast check
// watches is AA (4.5:1) or better, computed from the theme's own hex values.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { CONTRAST_PAIRS, contrastRatio, parseHexColor } from "../../src/shared/config/themeContrast.ts";
import { parseThemeDoc, type ThemeDoc } from "../../src/shared/config/themeDoc.ts";
import { SHIPPED_THEMES, isShippedThemeName } from "../../src/shared/config/themes/index.ts";

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

test("osionos ships exactly the five themes of the spec", () => {
  assert.deepEqual(themes.map((theme) => theme.raw.name).sort(), ["Graphite Compact", "Harbor Night", "High Contrast", "Meadow", "Studio Paper"]);
  assert.deepEqual(SHIPPED_THEMES.map((theme) => theme.name).sort(), themes.map((theme) => theme.raw.name).sort());
  assert.equal(isShippedThemeName("meadow"), true);
  assert.equal(isShippedThemeName("My theme"), false);
});

for (const { name, raw } of themes) {
  test(`${name} is a valid theme with every checked pair at AA or better`, () => {
    const { doc, issues } = parseThemeDoc(raw);
    assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
    assert.ok(doc?.base, "sets base");
    const colors = doc?.colors ?? {};
    const total = Object.keys(colors).length + Object.keys(doc?.layout ?? {}).length + Object.keys(doc?.fonts ?? {}).length;
    assert.ok(total >= 20, `${total} keys`);
    for (const [fg, bg] of CONTRAST_PAIRS) {
      const front = parseHexColor(colors[fg] ?? "");
      const back = parseHexColor(colors[bg] ?? "");
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
