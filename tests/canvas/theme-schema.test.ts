/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-schema.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editor's JSON schema is built from the token catalog, so completion offers
// exactly the tokens a theme may set, each with what it paints and its value
// now; and a problem found by the theme parser is placed on the key it names.

import assert from "node:assert/strict";
import test from "node:test";

import { buildThemeSchema } from "../../src/features/theme-editor/model/themeSchema.ts";
import { findJsonKeyRange } from "../../src/features/theme-editor/model/jsonKeyRange.ts";
import { PALETTES } from "../../src/shared/config/theme.ts";
import { THEME_TOKENS } from "../../src/shared/config/themeTokens.ts";

type PropertySchema = { format?: string; markdownDescription?: string; maxLength?: number; type?: string };
type GroupSchema = { additionalProperties: boolean; properties: Record<string, PropertySchema> };
type ThemeSchema = { properties: { palette: { enum: string[] }; colors: GroupSchema; layout: GroupSchema; fonts: GroupSchema } };

const schema = buildThemeSchema((key) => (key === "bg-page" ? "#123456" : "")) as ThemeSchema;

test("each group lists exactly the catalog's tokens of that group and nothing else", () => {
  for (const group of ["colors", "layout", "fonts"] as const) {
    const expected = THEME_TOKENS.filter((token) => token.group === group).map((token) => token.key).sort();
    assert.deepEqual(Object.keys(schema.properties[group].properties).sort(), expected, group);
    assert.equal(schema.properties[group].additionalProperties, false);
  }
});

test("a colour token offers the colour picker and shows its value now", () => {
  const bgPage = schema.properties.colors.properties["bg-page"];
  assert.equal(bgPage.format, "color-hex");
  assert.equal(bgPage.type, "string");
  assert.equal(bgPage.maxLength, 160);
  assert.ok(bgPage.markdownDescription?.includes("Now: `#123456`"), bgPage.markdownDescription);
  assert.equal(schema.properties.layout.properties.radius.format, undefined);
});

test("palette offers the shipped palette ids", () => {
  assert.deepEqual(schema.properties.palette.enum, PALETTES.map((palette) => palette.id));
});

test("findJsonKeyRange gives the offsets of the key at a path, quotes included", () => {
  const text = '{"colors":{"accent":"#fff","x":{"accent":1}}}';
  assert.deepEqual(findJsonKeyRange(text, ["colors", "accent"]), { start: 11, end: 19 });
  assert.deepEqual(findJsonKeyRange(text, ["colors", "x", "accent"]), { start: 32, end: 40 });
  assert.deepEqual(findJsonKeyRange(text, ["colors"]), { start: 1, end: 9 });
});

test("findJsonKeyRange is null for a missing path and is not fooled by a key-like string value", () => {
  assert.equal(findJsonKeyRange('{"colors":{"accent":"#fff"}}', ["colors", "link"]), null);
  assert.equal(findJsonKeyRange('{"colors":{"accent":"#fff"}}', ["layout", "accent"]), null);
  const text = '{"name":"colors","note":"{\\"colors\\":{\\"accent\\":1}}","colors":{"accent":"#fff"}}';
  const at = text.lastIndexOf('"accent"');
  assert.deepEqual(findJsonKeyRange(text, ["colors", "accent"]), { start: at, end: at + '"accent"'.length });
});
