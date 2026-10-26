/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-rules.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The structural rules a theme and a profile must pass, shared by the app and
// the bridge: the bridge refuses what this refuses, so a value that could break
// out of a CSS declaration never reaches a stored row or the pre-paint cache.

import assert from "node:assert/strict";
import test from "node:test";

import {
  THEME_LIMITS,
  checkProfileShape,
  checkThemeShape,
  isSafeTokenValue,
  themeSlug,
} from "../../scripts/bridge-theme-rules.mjs";

const HARBOR_NIGHT = {
  name: "Harbor Night",
  base: "dark",
  palette: "nord",
  colors: { "bg-page": "#0f1520", "fg-default": "#dbe4ee", accent: "#5fb3b3" },
  layout: { radius: "10px", "page-max-width": "880px", "topbar-h": "44px" },
  fonts: { "font-ui": "\"Inter Variable\", system-ui, sans-serif", "font-size-ui": "15px" },
};

test("a value that stays inside one CSS declaration is safe", () => {
  for (const value of ["#0f1520", "rgb(1 2 3 / 50%)", "\"Inter Variable\", system-ui", "calc(100% - 2rem)"]) {
    assert.equal(isSafeTokenValue(value), true, value);
  }
});

test("a value that could escape the declaration or load something is refused", () => {
  const refused: unknown[] = [
    "red; } body {", "url(x)", "var(--osio-a)", "expression(1)", "a\\0", "x!important",
    "@import", "<b>", "a".repeat(161), "", 42, null,
  ];
  for (const value of refused) assert.equal(isSafeTokenValue(value), false, String(value));
});

test("a slug keeps only lowercase letters, digits and single dashes", () => {
  assert.equal(themeSlug("Harbor Night"), "harbor-night");
  assert.equal(themeSlug("  Ünïcode  Name!! "), "n-code-name");
  assert.equal(themeSlug("!!!"), "");
  const long = themeSlug("a very long theme name that keeps going well past the cap");
  assert.ok(long.length <= THEME_LIMITS.slugMax, long);
  assert.ok(!long.endsWith("-") && !long.startsWith("-"), long);
});

test("the spec's example theme passes", () => {
  assert.deepEqual(checkThemeShape(HARBOR_NIGHT), []);
});

test("each broken theme names the path that is wrong", () => {
  const cases: [string, unknown][] = [
    ["name", { ...HARBOR_NIGHT, name: undefined }],
    ["base", { ...HARBOR_NIGHT, base: "dim" }],
    ["palette", { ...HARBOR_NIGHT, palette: "Nord!" }],
    ["colors", { ...HARBOR_NIGHT, colors: ["#000"] }],
    ["colors.bg-page", { ...HARBOR_NIGHT, colors: { "bg-page": { nested: "#000" } } }],
    ["colors.Bad_Key", { ...HARBOR_NIGHT, colors: { Bad_Key: "#000" } }],
    ["layout", { ...HARBOR_NIGHT, layout: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, "1px"])) }],
    ["extra", { ...HARBOR_NIGHT, extra: true }],
  ];
  for (const [path, doc] of cases) {
    const errors = checkThemeShape(doc);
    assert.ok(errors.length > 0, `no error for ${path}`);
    assert.ok(errors.some((message: string) => message.includes(path)), `${path}: ${errors.join(" | ")}`);
  }
});

test("a theme over 12 KB of JSON is refused", () => {
  const colors = Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`c${i}`, "a".repeat(150)]));
  const errors = checkThemeShape({ ...HARBOR_NIGHT, colors });
  assert.ok(errors.some((message: string) => message.includes("12 KB")), errors.join(" | "));
});

test("a profile names a theme or carries one inline", () => {
  const preferences = { mode: "dark", density: "compact" };
  assert.deepEqual(checkProfileShape({ name: "Writing", theme: "Harbor Night", preferences }), []);
  assert.deepEqual(checkProfileShape({ name: "Writing", theme: HARBOR_NIGHT, preferences }), []);
  assert.deepEqual(checkProfileShape({ name: "Writing", theme: null, preferences: {} }), []);
});

test("a broken profile names the path that is wrong", () => {
  const tooMany = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}`, "x"]));
  const cases: [string, unknown][] = [
    ["preferences.density", { name: "W", theme: null, preferences: { density: { size: 1 } } }],
    ["preferences", { name: "W", theme: null, preferences: tooMany }],
    ["name", { name: "n".repeat(49), theme: null, preferences: {} }],
    ["theme.base", { name: "W", theme: { ...HARBOR_NIGHT, base: "dim" }, preferences: {} }],
  ];
  for (const [path, doc] of cases) {
    const errors = checkProfileShape(doc);
    assert.ok(errors.some((message: string) => message.includes(path)), `${path}: ${errors.join(" | ")}`);
  }
});
