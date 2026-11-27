// uniqueThemeName: a free name is kept; taken, shipped and slug-colliding names get a numeric suffix within the name limit.

import assert from "node:assert/strict";
import test from "node:test";

import { SHIPPED_THEMES } from "../../src/shared/config/themes/index.ts";
import { uniqueThemeName } from "../../src/features/theme/model/themeNaming.ts";

test("a free name is kept, trimmed", () => {
  assert.equal(uniqueThemeName("  Dusk  ", []), "Dusk");
});

test("a taken name gets a numeric suffix, counting up", () => {
  assert.equal(uniqueThemeName("Dusk", ["Dusk"]), "Dusk 2");
  assert.equal(uniqueThemeName("Dusk", ["Dusk", "Dusk 2"]), "Dusk 3");
  assert.equal(uniqueThemeName("Dusk copy", ["Dusk copy"]), "Dusk copy 2");
});

test("a shipped name is never returned", () => {
  const name = SHIPPED_THEMES[0].name;
  assert.notEqual(uniqueThemeName(name, []), name);
  assert.equal(uniqueThemeName(name.toUpperCase(), []).toLowerCase().startsWith(name.toLowerCase()), true);
});

test("a slug collision counts as taken", () => {
  assert.equal(uniqueThemeName("My Theme", ["my-theme"]), "My Theme 2");
});

test("a long name stays within the limit and still becomes unique", () => {
  const long = "x".repeat(48);
  const first = uniqueThemeName(long, [long]);
  assert.ok(first.length <= 48);
  assert.notEqual(first, long);
  assert.ok(uniqueThemeName(long, [long, first]).length <= 48);
});
