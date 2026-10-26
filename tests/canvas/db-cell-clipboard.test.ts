// Cell copy/paste: what a copied cell puts on the clipboard, how pasted text
// becomes a stored value per column type, and how a pasted grid maps onto the
// selected range of visible rows and columns.

import assert from "node:assert/strict";
import test from "node:test";

import {
  cellCopyText, copyRange, parsePastedValue, parseTsv, planClear, planPaste,
} from "../../src/shared/notion-database-sys/src/components/views/table/gridClipboard.ts";
import { clearValueFor } from "../../src/shared/notion-database-sys/src/components/views/table/gridKeyboard.ts";
import type { DatabaseSchema, Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";

const prop = (id: string, type: string, extra: Partial<SchemaProperty> = {}) =>
  ({ id, name: id, type, ...extra }) as SchemaProperty;
const STATUS = prop("status", "select", { options: [{ id: "o1", value: "Done", color: "green" }, { id: "o2", value: "To do", color: "gray" }] });
const TAGS = prop("tags", "multi_select", { options: STATUS.options });
const page = (id: string, properties: Record<string, unknown> = {}) =>
  ({ id, databaseId: "db", properties, createdAt: "", updatedAt: "" }) as unknown as Page;

test("copy writes what the cell shows", () => {
  const db = { id: "db", titlePropertyId: "name", properties: {} } as unknown as DatabaseSchema;
  const p = page("r1", { status: "o1", tags: ["o1", "o2"], done: true, n: 3, d: new Date(2026, 9, 20).toISOString() });
  const source = { pages: { r1: p }, databases: { db } };
  assert.equal(cellCopyText(source, p, STATUS), "Done");
  assert.equal(cellCopyText(source, p, TAGS), "Done, To do");
  assert.equal(cellCopyText(source, p, prop("done", "checkbox")), "Yes");
  assert.equal(cellCopyText(source, p, prop("n", "number")), "3");
  assert.equal(cellCopyText(source, p, prop("d", "date")), "2026-10-20");
  assert.equal(cellCopyText(source, p, prop("missing", "text")), "");
});

test("copied text pastes back to the same stored value", () => {
  const iso = new Date(2026, 9, 20, 14, 30).toISOString();
  const db = { id: "db", titlePropertyId: "name", properties: {} } as unknown as DatabaseSchema;
  const cases: Array<[SchemaProperty, unknown]> = [
    [STATUS, "o2"], [TAGS, ["o1", "o2"]], [prop("c", "checkbox"), false], [prop("n", "number"), -2.5],
    [prop("d", "date"), iso], [prop("t", "text"), "multi\nline"],
  ];
  for (const [col, stored] of cases) {
    const p = page("r", { [col.id]: stored });
    const text = cellCopyText({ pages: { r: p }, databases: { db } }, p, col);
    assert.deepEqual(parsePastedValue(text, col), stored, `${col.type} via "${text}"`);
  }
});

test("paste refuses text a column cannot hold", () => {
  assert.equal(parsePastedValue("abc", prop("n", "number")), undefined);
  assert.equal(parsePastedValue("1,000", prop("n", "number")), undefined, "ambiguous separator");
  assert.equal(parsePastedValue("maybe", prop("c", "checkbox")), undefined);
  assert.equal(parsePastedValue("Unknown", STATUS), undefined);
  assert.equal(parsePastedValue("Nope, Neither", TAGS), undefined);
  assert.equal(parsePastedValue("5", prop("d", "date")), undefined, "Date.parse would read 2001");
  for (const t of ["formula", "rollup", "relation", "created_time", "id", "button", "files_media"]) {
    assert.equal(parsePastedValue("x", prop("p", t)), undefined, t);
  }
});

test("paste parses each type's common spellings", () => {
  assert.equal(parsePastedValue(" 1 000.5 ", prop("n", "number")), 1000.5);
  assert.equal(parsePastedValue("done", STATUS), "o1", "labels match case-insensitively");
  assert.equal(parsePastedValue("o2", STATUS), "o2", "an option id matches too");
  assert.deepEqual(parsePastedValue("Done; done, Bogus", TAGS), ["o1"], "unknown dropped, duplicates merged");
  for (const yes of ["Yes", "TRUE", "x", "✓", "1"]) assert.equal(parsePastedValue(yes, prop("c", "checkbox")), true, yes);
  assert.equal(parsePastedValue("2026-10-20T08:00:00Z", prop("d", "date")), "2026-10-20T08:00:00.000Z");
  assert.equal(parsePastedValue("  a@b.co ", prop("e", "email")), "a@b.co");
  assert.equal(parsePastedValue("  keep ", prop("t", "text")), "  keep ", "text is verbatim");
});

test("pasting nothing clears a column the way Delete does", () => {
  for (const t of ["number", "checkbox", "multi_select", "text", "date"]) {
    assert.deepEqual(parsePastedValue("  ", prop("p", t)), clearValueFor(t), t);
  }
  assert.equal(clearValueFor("number"), null, "same as an emptied number editor");
});

test("parseTsv: tabs, lines and spreadsheet quoting", () => {
  assert.deepEqual(parseTsv("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTsv('"x\ty"\t"say ""hi"""\n"l1\nl2"\tz'), [["x\ty", 'say "hi"'], ["l1\nl2", "z"]]);
  assert.deepEqual(parseTsv('5" screen'), [['5" screen']], "a quote mid-cell is literal");
  assert.deepEqual(parseTsv(""), [[""]]);
  assert.deepEqual(parseTsv("a\t\tb"), [["a", "", "b"]]);
});

const range = (rowStart: number, rowEnd: number, colStart: number, colEnd: number) => ({ rowStart, rowEnd, colStart, colEnd });

test("planPaste lands a block from the range's corner and clips to what is on screen", () => {
  const rows = [page("r1"), page("r2"), page("r3")];
  const cols = [prop("t", "text"), prop("n", "number"), prop("f", "formula")];
  const writes = planPaste([["a", "1", "x"], ["b", "oops"], ["c", "3"], ["d", "4"]], range(1, 1, 0, 0), rows, cols);
  assert.deepEqual(writes, [
    { pageId: "r2", propId: "t", value: "a" }, { pageId: "r2", propId: "n", value: 1 },
    { pageId: "r3", propId: "t", value: "b" },
  ], "formula skipped, bad number skipped, rows past the end dropped");
});

test("one copied value fills every selected cell", () => {
  const rows = [page("r1"), page("r2")];
  const cols = [prop("n", "number"), prop("m", "number")];
  assert.deepEqual(planPaste([["7"]], range(0, 1, 0, 1), rows, cols).map(w => w.value), [7, 7, 7, 7]);
});

test("planClear empties writable cells only", () => {
  const rows = [page("r1")];
  const cols = [prop("t", "text"), prop("c", "checkbox"), prop("f", "formula")];
  assert.deepEqual(planClear(range(0, 0, 0, 2), rows, cols), [
    { pageId: "r1", propId: "t", value: "" }, { pageId: "r1", propId: "c", value: false },
  ]);
});

test("a copied range round-trips through spreadsheet text", () => {
  const db = { id: "db", titlePropertyId: "name", properties: {} } as unknown as DatabaseSchema;
  const rows = [page("r1", { status: "o1", t: "a\tb" }), page("r2", { status: "o2", t: 'say "hi"' })];
  const source = { pages: { r1: rows[0], r2: rows[1] }, databases: { db } };
  const text = copyRange(range(0, 1, 0, 1), rows, [STATUS, prop("t", "text")], source);
  assert.deepEqual(parseTsv(text), [["Done", "a\tb"], ["To do", 'say "hi"']]);
});
