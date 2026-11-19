/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   raw-console-catalogue.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Advanced console's completion and hover are read off the style scales and the reader's
// container kinds, never a second list (ADR 0064 PS22, PS23). Monaco is not loaded here: the
// catalogue is plain data, and the editor only adapts it.

import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";
import { PROP_SCALE, STYLE_SCALES } from "../../src/entities/block/model/blockStyle.ts";
import { LAYOUT_STYLE_KEYS } from "../../src/entities/block/model/blockStyleAttributes.ts";
import { CONTAINER_KINDS, consoleCompletions, consoleHover } from "../../src/features/raw-mode/model/consoleCatalogue.ts";

const ON = { layoutModes: true };
const OFF = { layoutModes: false };
const labels = (prefix: string, flags = ON) => consoleCompletions(prefix, flags).items.map((item) => item.label);

test("every catalogued kind is one the engine reads as a container", () => {
  assert.deepEqual([...CONTAINER_KINDS], ["columns", "column", "row", "stack", "grid", "section"]);
  for (const kind of CONTAINER_KINDS) {
    const [block] = parseMarkdownToBlocks(`::: ${kind} {gap=1}\ntext\n:::`, { containerAttributes: true });
    assert.equal(block.containerAttributes?.kind, kind, kind);
  }
});

test("an opener's kind completes from the kinds, replacing the typed part", () => {
  assert.deepEqual(labels(":::"), [...CONTAINER_KINDS]);
  assert.deepEqual(consoleCompletions("  ::: gr", ON), { startColumn: 7, items: consoleCompletions(":::", ON).items });
  assert.equal(consoleCompletions(":::", ON).items[0].kind, "kind");
});

test("inside the braces the keys complete, layout keys first", () => {
  const keys = labels("::: grid {");
  assert.deepEqual(keys.slice(0, LAYOUT_STYLE_KEYS.length), [...LAYOUT_STYLE_KEYS]);
  assert.deepEqual([...keys].sort(), Object.keys(PROP_SCALE).sort());
  assert.equal(consoleCompletions("::: grid {cols=3 mi", ON).startColumn, 18);
  assert.equal(consoleCompletions(":::column 0.5 {", ON).items[0].kind, "key");
});

test("after key= the values come from that key's scale", () => {
  assert.deepEqual(labels("::: grid {cols="), STYLE_SCALES.cols.map(String));
  assert.deepEqual(labels(":::column {span=2"), STYLE_SCALES.cols.map(String));
  assert.deepEqual(labels("::: grid {gap="), STYLE_SCALES.space.map(String));
  assert.equal(consoleCompletions("::: grid {cols=1", ON).startColumn, 16);
  assert.equal(consoleCompletions("::: grid {cols=", ON).items[0].kind, "value");
});

test("nothing completes outside an opener, after the braces or for an unknown key", () => {
  for (const prefix of ["", "text ::: ", "::: grid {cols=3} ", "::: grid {bogus=", "> ::: grid {", "::: grid cols="]) {
    assert.deepEqual(labels(prefix), [], prefix);
  }
});

test("with osio.layout.modes off, only the columns kinds complete: no section, layout kind, key or value", () => {
  assert.deepEqual(labels(":::", OFF), ["columns", "column"]);
  assert.deepEqual(labels("::: se", OFF), ["columns", "column"]);
  for (const prefix of ["::: grid {", "::: grid {cols=", ":::column {span=", "::: section {gap="]) {
    assert.deepEqual(labels(prefix, OFF), [], prefix);
  }
});

test("hover names a kind or a key in one line, and nothing else", () => {
  const kind = consoleHover("::: grid {cols=3}", 6);
  assert.equal(kind?.startColumn, 5);
  assert.equal(kind?.endColumn, 9);
  assert.match(kind?.text ?? "", /grid/);
  const key = consoleHover("::: grid {cols=3}", 12);
  assert.deepEqual([key?.startColumn, key?.endColumn], [11, 15]);
  assert.match(key?.text ?? "", /1 · 2 · 3 · 4 · 5 · 6/);
  for (const hover of [kind, key]) assert.equal(hover?.text.includes("\n"), false);
  assert.equal(consoleHover("::: grid {cols=3}", 16), null);
  assert.equal(consoleHover("plain grid text", 8), null);
  assert.equal(consoleHover("::: grid {bogus=1}", 12), null);
});
