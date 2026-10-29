/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   button-program-editor.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseButtonProgram } from "@/entities/block/model/buttonProgram";
import type { ButtonProgram } from "@/entities/block/model/buttonProgram";
import {
  addStep,
  changeOp,
  fromProgram,
  moveStep,
  newStep,
  programJson,
  removeStep,
  toProgram,
  updateStep,
  valueFromText,
  valueKind,
  valueText,
  withValueKind,
} from "@/features/button-program/model/stepList";

const NESTED: ButtonProgram = {
  version: 1,
  steps: [
    { op: "set", name: "x", value: 2 },
    {
      op: "if",
      condition: { formula: "x > 1" },
      steps: [
        { op: "repeat", count: 2, steps: [{ op: "action", action: { type: "notify", message: "deep" } }] },
      ],
      else: [{ op: "forEach", items: { formula: "list" }, as: "it", steps: [] }],
    },
  ],
};

test("list <-> AST: a nested program round-trips exactly", () => {
  assert.deepEqual(toProgram(fromProgram(NESTED)), NESTED);
});

test("list -> AST drops the UI-only keys and keeps every nested step", () => {
  const json = JSON.stringify(toProgram(fromProgram(NESTED)));
  assert.equal(json.includes('"key"'), false);
  assert.equal(json.includes("deep"), true);
  assert.equal(json.includes("forEach"), true);
});

test("an empty list is a valid program", () => {
  assert.deepEqual(toProgram([]), { version: 1, steps: [] });
  assert.equal(parseButtonProgram(toProgram([])).ok, true);
});

test("add / remove at the root and into a nested list", () => {
  let draft = fromProgram(NESTED);
  draft = addStep(draft, [1, "steps"], newStep("set"));
  const grown = toProgram(draft).steps[1];
  assert.equal(grown.op === "if" ? grown.steps.length : -1, 2);
  draft = removeStep(draft, [1, "steps"], 1);
  assert.deepEqual(toProgram(draft), NESTED);
  draft = removeStep(draft, [], 0);
  assert.equal(toProgram(draft).steps.length, 1);
});

test("reorder swaps neighbours and ignores moves off either end", () => {
  const draft = fromProgram(NESTED);
  const up = toProgram(moveStep(draft, [], 1, -1)).steps;
  assert.deepEqual(up.map((s) => s.op), ["if", "set"]);
  assert.deepEqual(toProgram(moveStep(draft, [], 0, -1)), NESTED);
  assert.deepEqual(toProgram(moveStep(draft, [], 1, 1)), NESTED);
});

test("update edits one step and leaves its siblings alone", () => {
  const draft = updateStep(fromProgram(NESTED), [], 0, (s) => (s.op === "set" ? { ...s, name: "y" } : s));
  const steps = toProgram(draft).steps;
  assert.equal(steps[0].op === "set" && steps[0].name, "y");
  assert.equal(steps[1].op, "if");
});

test("changing a step's kind swaps it for a fresh step of that kind in place", () => {
  const draft = changeOp(fromProgram(NESTED), [], 0, "repeat");
  assert.deepEqual(toProgram(draft).steps.map((s) => s.op), ["repeat", "if"]);
});

test("every fresh step kind parses on its own", () => {
  for (const op of ["set", "if", "repeat", "forEach", "action"] as const) {
    const result = parseButtonProgram(toProgram([newStep(op)]));
    assert.equal(result.ok, true, op);
  }
});

test("an invalid draft is caught by the parser, so it never reaches the block", () => {
  const draft = updateStep([newStep("set")], [], 0, (s) => (s.op === "set" ? { ...s, name: "has space" } : s));
  const result = parseButtonProgram(toProgram(draft));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.path, "steps[0].name");
});

test("value kinds convert and read back as text", () => {
  assert.equal(valueKind("a"), "text");
  assert.equal(valueKind(3), "number");
  assert.equal(valueKind(false), "boolean");
  assert.equal(valueKind(null), "empty");
  assert.equal(valueKind({ formula: "1" }), "formula");
  assert.deepEqual(withValueKind("formula"), { formula: "" });
  assert.equal(valueText({ formula: "a + 1" }), "a + 1");
  assert.deepEqual(valueFromText({ formula: "" }, "b"), { formula: "b" });
  assert.equal(valueFromText(0, "12"), 12);
  assert.equal(valueFromText(0, "nope"), 0);
  assert.equal(valueFromText("", "hi"), "hi");
});

test("the code view is exactly JSON.stringify(program, null, 2)", () => {
  assert.equal(programJson(fromProgram(NESTED)), JSON.stringify(NESTED, null, 2));
});

test("hostile text stays text in the code view", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const draft = updateStep([newStep("action")], [], 0, (s) =>
    s.op === "action" ? { ...s, action: { type: "notify", message: hostile } } : s,
  );
  assert.equal(programJson(draft).includes(JSON.stringify(hostile).slice(1, -1)), true);
});
