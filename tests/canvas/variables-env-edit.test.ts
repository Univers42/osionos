/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variables-env-edit.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The `{{` menu's "Create NAME" writes into an env.json the user also edits by hand, so
// the edit appends one entry and leaves every other byte of the file as it was.

import assert from "node:assert/strict";
import test from "node:test";

import { addVariableToSource } from "../../src/features/variables/model/envFileEdit.ts";
import { VARIABLE_LIMITS } from "../../src/features/variables/model/variableDefinitions.ts";
import { mulberry32 } from "./markdown-fidelity-fixtures.ts";

const added = (source: string, name: string, value: string) => {
  const result = addVariableToSource(source, name, value);
  assert.ok("source" in result, `expected a new source, got ${JSON.stringify(result)}`);
  return result.source;
};

test("an empty or blank file becomes a one-entry object", () => {
  assert.equal(added("", "CLIENT", "Acme"), '{\n  "CLIENT": "Acme"\n}\n');
  assert.equal(added("  \n", "CLIENT", "Acme"), '{\n  "CLIENT": "Acme"\n}\n');
  assert.equal(added("{}\n", "CLIENT", "Acme"), '{\n  "CLIENT": "Acme"\n}\n');
});

test("the entry goes last and the existing text is kept byte for byte", () => {
  const source = '{\n    "B": 2,\n    "A": { "type": "number", "value": 1 }\n}\n';
  assert.equal(added(source, "C", "x"), '{\n    "B": 2,\n    "A": { "type": "number", "value": 1 },\n    "C": "x"\n}\n');
});

test("tab indentation and a missing final newline are kept", () => {
  assert.equal(added('{\n\t"A": "1"\n}', "B", "2"), '{\n\t"A": "1",\n\t"B": "2"\n}');
});

test("quotes, backslashes and braces in the value are escaped", () => {
  const next = added('{ "A": "1" }', "B", 'say "hi" \\ {{A}}');
  assert.equal(JSON.parse(next).B, 'say "hi" \\ {{A}}');
});

test("refusals leave the file alone and say why", () => {
  assert.match(String(Reflect.get(addVariableToSource('{ "A": ', "B", "x"), "error")), /not valid JSON/);
  assert.match(String(Reflect.get(addVariableToSource("[1]", "B", "x"), "error")), /object/);
  assert.match(String(Reflect.get(addVariableToSource('{ "B": 1 }', "B", "x"), "error")), /already/);
  assert.match(String(Reflect.get(addVariableToSource("{}", "1BAD", "x"), "error")), /names start/);
  assert.match(String(Reflect.get(addVariableToSource("{}", "B", "x".repeat(VARIABLE_LIMITS.valueChars + 1)), "error")), /characters/);
  const full = JSON.stringify(Object.fromEntries(Array.from({ length: VARIABLE_LIMITS.count }, (_, i) => [`V${i}`, 1])));
  assert.match(String(Reflect.get(addVariableToSource(full, "B", "x"), "error")), /env\.<topic>\.json/);
  const big = JSON.stringify({ A: "x".repeat(VARIABLE_LIMITS.sourceChars - 20) });
  assert.match(String(Reflect.get(addVariableToSource(big, "B", "x".repeat(40)), "error")), /env\.<topic>\.json/);
});

test("generated files: the result parses to the old entries, in order, plus the new one", () => {
  for (let seed = 0; seed < 500; seed += 1) {
    const random = mulberry32(seed);
    const entries = Array.from({ length: Math.floor(random() * 6) }, (_, i) => [`K${i}_${seed}`, random() < 0.5 ? `v${i}` : i]);
    const indent = [0, 1, 2, 4, "\t"][Math.floor(random() * 5)];
    const source = JSON.stringify(Object.fromEntries(entries), null, indent) + (random() < 0.5 ? "\n" : "");
    const value = String.fromCharCode(...Array.from({ length: Math.floor(random() * 12) }, () => 32 + Math.floor(random() * 95)));
    const next = added(source, "NEW", value);
    const where = `seed ${seed}: ${JSON.stringify({ source, value })}`;
    assert.deepEqual(Object.entries(JSON.parse(next)), [...entries, ["NEW", value]], where);
    assert.ok(next.endsWith(source.endsWith("\n") ? "}\n" : "}"), where);
  }
});
