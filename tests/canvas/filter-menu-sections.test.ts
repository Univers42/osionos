// The block menu's search keeps matching rows and drops sections left empty.

import assert from "node:assert/strict";
import test from "node:test";

import { filterMenuSections } from "../../src/features/block-editor/model/filterMenuSections.ts";

const item = (label: string) => ({ label, icon: null, onClick: () => undefined });
const SECTIONS = [
  { label: "Insert", items: [item("Insert text above"), item("Insert text below")] },
  { label: "Actions", items: [item("Duplicate"), item("Delete")] },
];

test("a blank query keeps every section as it is", () => {
  assert.equal(filterMenuSections(SECTIONS, "  "), SECTIONS);
});

test("matching is case-insensitive and drops sections with no match", () => {
  const result = filterMenuSections(SECTIONS, "DEL");
  assert.deepEqual(result.map((section) => section.label), ["Actions"]);
  assert.deepEqual(result[0].items.map((row) => row.label), ["Delete"]);
});

test("a query matching nothing leaves no sections", () => {
  assert.deepEqual(filterMenuSections(SECTIONS, "zzz"), []);
});
