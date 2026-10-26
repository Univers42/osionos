/**
 * The reasoning effort in the client: the stored choice, the run input, and
 * the picker that is drawn only for a model that reasons.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AI_SELECTION_STORAGE_KEY,
  readAiSelection,
  resolveAiSelection,
  selectionEffort,
  writeAiSelection,
  type SelectionStorage,
} from "@/features/ai/model/aiSelection";
import { EffortPicker } from "@/features/ai/ui/EffortPicker";

function memoryStorage(initial?: string): SelectionStorage & { raw: () => string | null } {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    raw: () => value,
  };
}

const models = { platform: [{ id: "think", default: true, reasoning: true }, { id: "plain" }] };

test("the selection round-trips with and without an effort", () => {
  const storage = memoryStorage();
  writeAiSelection({ connectionId: "platform", model: "think", effort: "high" }, storage);
  assert.deepEqual(readAiSelection(storage), { connectionId: "platform", model: "think", effort: "high" });
  writeAiSelection({ connectionId: "platform", model: "think" }, storage);
  assert.deepEqual(readAiSelection(storage), { connectionId: "platform", model: "think" });
});

test("an old stored value still parses, and an unknown effort is kept out", () => {
  assert.deepEqual(
    readAiSelection(memoryStorage(JSON.stringify({ connectionId: "platform", model: "m" }))),
    { connectionId: "platform", model: "m" },
  );
  const odd = memoryStorage(JSON.stringify({ connectionId: "platform", model: "think", effort: "extreme" }));
  assert.equal(readAiSelection(odd)?.effort, undefined);
  assert.ok(odd.getItem(AI_SELECTION_STORAGE_KEY));
  const resolved = resolveAiSelection(
    { connectionId: "platform", model: "think", effort: "extreme" as never },
    [{ id: "platform" }],
    models,
  );
  assert.equal(resolved.effort, undefined);
  assert.equal(
    resolveAiSelection({ connectionId: "platform", model: "think", effort: "low" }, [{ id: "platform" }], models).effort,
    "low",
  );
});

test("the run carries an effort only for a model that reasons", () => {
  assert.equal(selectionEffort({ connectionId: "platform", model: "think", effort: "low" }, models), "low");
  assert.equal(selectionEffort({ connectionId: "platform", model: "plain", effort: "low" }, models), undefined);
  assert.equal(selectionEffort({ connectionId: "platform", model: "gone", effort: "low" }, models), undefined);
  assert.equal(selectionEffort({ connectionId: "platform", model: "think" }, models), undefined);
});

test("the picker is a radiogroup with exactly one checked radio, Medium by default", () => {
  const html = renderToStaticMarkup(React.createElement(EffortPicker, { onChange: () => undefined }));
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /aria-label="Reasoning effort"/);
  assert.equal(html.match(/role="radio"/g)?.length, 3);
  assert.equal(html.match(/aria-checked="true"/g)?.length, 1);
  assert.match(html, /aria-checked="true"[^>]*>Medium</);
  const high = renderToStaticMarkup(React.createElement(EffortPicker, { value: "high", onChange: () => undefined }));
  assert.match(high, /aria-checked="true"[^>]*>High</);
  assert.equal(high.match(/aria-checked="true"/g)?.length, 1);
});
