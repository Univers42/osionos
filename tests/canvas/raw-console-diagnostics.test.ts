/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   raw-console-diagnostics.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Advanced console's diagnostics are the save's own reading of the source (ADR 0064 PS23):
// the engine parse rawSave uses, then resolveContainerAttributes. Each drop lands on the line of
// the opener that carried it, on the `key=value` token when it names a key.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveContainerAttributes } from "../../src/features/page-file/model/containerStyle.ts";
import { consoleDiagnostics } from "../../src/features/raw-mode/model/consoleDiagnostics.ts";
import { parseRawSource } from "../../src/features/raw-mode/model/rawSave.ts";

const at = (source: string) => consoleDiagnostics(source).map((d) => [d.line, d.startColumn, d.endColumn]);

test("a value off its scale is marked on its token, and gone once fixed", () => {
  const bad = "::: grid {cols=9}\ntext\n:::";
  const [diagnostic] = consoleDiagnostics(bad);
  assert.deepEqual([diagnostic.line, diagnostic.startColumn, diagnostic.endColumn], [1, 11, 17]);
  assert.match(diagnostic.message, /cols/);
  assert.match(diagnostic.message, /1 · 2 · 3 · 4 · 5 · 6/);
  assert.deepEqual(consoleDiagnostics(bad.replace("cols=9", "cols=3")), []);
});

test("an unknown key and a layout that fights its kind are named", () => {
  const messages = consoleDiagnostics("::: grid {bogus=1 layout=row}\na\n:::").map((d) => d.message);
  assert.equal(messages.length, 2);
  assert.match(messages.find((m) => m.includes("bogus")) ?? "", /unknown/i);
  assert.match(messages.find((m) => m.includes("layout")) ?? "", /grid/);
});

test("engine reports mark the braces", () => {
  const source = ":::columns {cols=3 cols=4 nope}\n:::column\na\n:::\n:::";
  const found = consoleDiagnostics(source);
  assert.deepEqual(found.map((d) => [d.line, d.startColumn, d.endColumn]), [[1, 12, 32], [1, 12, 32]]);
  assert.ok(found.some((d) => /twice/.test(d.message)));
  assert.ok(found.some((d) => /key=value/.test(d.message)));
});

test("a drop lands on the opener that carried it, past unattributed and code-fenced openers", () => {
  const source = [
    ":::columns",
    ":::column",
    "```",
    "::: grid {cols=7}",
    "```",
    ":::",
    ":::",
    "::: grid {cols=3}",
    ":::column {span=9}",
    "a",
    ":::",
    ":::",
    "  ::: stack {wrap=no}",
    "b",
    ":::",
  ].join("\n");
  assert.deepEqual(at(source), [[9, 12, 18], [13, 14, 21]]);
});

test("every drop the save reports is shown once", () => {
  const source = "::: grid {cols=9 bogus=1}\n:::column {span=0}\na\n:::\n:::\n::: row {wrap=x}\nb\n:::";
  const { dropped } = resolveContainerAttributes(parseRawSource(source));
  assert.equal(consoleDiagnostics(source).length, dropped.length);
  assert.equal(dropped.length, 4);
});

test("a drop whose opener cannot be found is still shown, on line 1", () => {
  const source = "text\n\n> [!note]\n> ::: grid {cols=9}\n> a\n> :::";
  const dropped = resolveContainerAttributes(parseRawSource(source)).dropped;
  const found = consoleDiagnostics(source);
  assert.ok(dropped.length > 0);
  assert.equal(found.length, dropped.length);
  for (const d of found) {
    assert.equal(d.line, 1);
    assert.match(d.message, /line unknown/);
  }
});
