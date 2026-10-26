/* ************************************************************************** */
/*  database-grid-clipboard.test.ts — range copy / paste for the table grid   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { rangeBetween } from "../../src/shared/notion-database-sys/src/components/views/table/gridKeyboard.ts";
import {
  cellToText,
  copyRange,
  parseTsv,
  planClear,
  planPaste,
  textToCellValue,
  toTsv,
} from "../../src/shared/notion-database-sys/src/components/views/table/gridClipboard.ts";
import type { Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";

const OPTIONS = [
  { id: "o-a", value: "Alpha", color: "blue" },
  { id: "o-b", value: "Beta", color: "red" },
];
const prop = (id: string, type: string, extra: Partial<SchemaProperty> = {}) =>
  ({ id, name: id, type, ...extra }) as SchemaProperty;
const TITLE = prop("title", "title");
const TAGS = prop("tags", "multi_select", { options: OPTIONS });
const STAGE = prop("stage", "select", { options: OPTIONS });
const DONE = prop("done", "checkbox");
const COST = prop("cost", "number");
const MADE = prop("made", "created_time");

const page = (id: string, properties: Record<string, unknown>) => ({ id, databaseId: "db", properties }) as unknown as Page;
const PAGES = [
  page("p0", { title: "Row 0", tags: ["o-a"], stage: "o-a", done: true, cost: 1.5 }),
  page("p1", { title: "Row 1", tags: ["o-a", "o-b"], stage: "o-b", done: false, cost: 2 }),
  page("p2", { title: "Row 2", tags: [], stage: null, done: false, cost: null }),
  page("p3", { title: "Row 3", tags: ["o-b"], stage: "o-a", done: true, cost: 4 }),
];
const PROPS = [TITLE, TAGS, STAGE, DONE, COST, MADE];

test("toTsv / parseTsv round-trip tabs, newlines and quotes", () => {
  const rows = [["plain", "has\ttab"], ['say "hi"', "two\nlines"], ["", "end"]];
  assert.deepEqual(parseTsv(toTsv(rows)), rows);
  assert.equal(toTsv([["a", "b"], ["c", "d"]]), "a\tb\nc\td\n", "rows end in a newline, as Excel writes them");
  assert.equal(toTsv([["only"]]), "only");
});

test("parseTsv reads a spreadsheet column: CRLF and the trailing newline", () => {
  assert.deepEqual(parseTsv("Alpha\r\nBeta\r\n\r\nGamma\r\n"), [["Alpha"], ["Beta"], [""], ["Gamma"]]);
  assert.deepEqual(parseTsv("one value"), [["one value"]]);
  assert.deepEqual(parseTsv(""), [[""]]);
});

test("cellToText writes labels a person can read and paste back", () => {
  assert.equal(cellToText(["o-a", "o-b"], TAGS), "Alpha, Beta");
  assert.equal(cellToText("o-b", STAGE), "Beta");
  assert.equal(cellToText(true, DONE), "Yes");
  assert.equal(cellToText(false, DONE), "No");
  assert.equal(cellToText(1.5, COST), "1.5");
  assert.equal(cellToText(null, COST), "");
  assert.equal(cellToText(undefined, TITLE), "");
  assert.equal(cellToText(["r1", "r2"], prop("rel", "relation"), id => `T-${id}`), "T-r1, T-r2");
  assert.equal(cellToText([{ name: "a.pdf", url: "u" }], prop("files", "files_media")), "a.pdf");
});

test("textToCellValue coerces per type and skips what it cannot place", () => {
  assert.deepEqual(textToCellValue("alpha, BETA , Zeta", TAGS), ["o-a", "o-b"]);
  assert.equal(textToCellValue("Zeta", TAGS), undefined);
  assert.deepEqual(textToCellValue("", TAGS), []);
  assert.equal(textToCellValue("beta", STAGE), "o-b");
  assert.equal(textToCellValue("Gamma", STAGE), undefined);
  assert.equal(textToCellValue("Fresh", prop("s", "select")), "Fresh");
  for (const yes of ["Yes", "true", "1", "✓", "x"]) assert.equal(textToCellValue(yes, DONE), true, yes);
  for (const no of ["No", "false", "0", ""]) assert.equal(textToCellValue(no, DONE), false, no);
  assert.equal(textToCellValue("maybe", DONE), undefined);
  assert.equal(textToCellValue(" 42 ", COST), 42);
  assert.equal(textToCellValue("4 2", COST), undefined);
  assert.equal(textToCellValue("", COST), "");
  assert.equal(textToCellValue("2026-10-26", prop("d", "date")), "2026-10-26");
  assert.equal(textToCellValue("soon", prop("d", "date")), undefined);
  assert.equal(textToCellValue("  keep  spaces ", TITLE), "  keep  spaces ");
  assert.equal(textToCellValue("x", MADE), undefined);
  assert.equal(textToCellValue("p9", prop("rel", "relation")), undefined);
});

test("rangeBetween normalizes any drag direction and rejects unknown cells", () => {
  const range = rangeBetween({ pageId: "p3", propId: "stage" }, { pageId: "p1", propId: "title" }, PAGES, PROPS);
  assert.deepEqual(range, { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 2 });
  assert.equal(rangeBetween({ pageId: "gone", propId: "title" }, { pageId: "p1", propId: "title" }, PAGES, PROPS), null);
});

test("copyRange copies one column as a spreadsheet column", () => {
  const range = { rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 1 };
  assert.equal(copyRange(range, PAGES, PROPS), "Alpha\nAlpha, Beta\n\n");
  assert.deepEqual(parseTsv(copyRange(range, PAGES, PROPS)), [["Alpha"], ["Alpha, Beta"], [""]]);
});

test("planPaste: one copied value fills every selected cell", () => {
  const writes = planPaste([["Beta"]], { rowStart: 0, rowEnd: 2, colStart: 2, colEnd: 2 }, PAGES, PROPS);
  assert.deepEqual(writes, [
    { pageId: "p0", propId: "stage", value: "o-b" },
    { pageId: "p1", propId: "stage", value: "o-b" },
    { pageId: "p2", propId: "stage", value: "o-b" },
  ]);
});

test("planPaste: a copied block lands from the top-left cell, clipped to the grid", () => {
  const writes = planPaste([["Alpha", "Yes"], ["Beta", "No"], ["Alpha", "No"]], { rowStart: 2, rowEnd: 2, colStart: 2, colEnd: 2 }, PAGES, PROPS);
  assert.deepEqual(writes, [
    { pageId: "p2", propId: "stage", value: "o-a" },
    { pageId: "p2", propId: "done", value: true },
    { pageId: "p3", propId: "stage", value: "o-b" },
    { pageId: "p3", propId: "done", value: false },
  ]);
  const edge = planPaste([["1", "2", "3"]], { rowStart: 0, rowEnd: 0, colStart: 4, colEnd: 4 }, PAGES, PROPS);
  assert.deepEqual(edge, [{ pageId: "p0", propId: "cost", value: 1 }], "the read-only column after cost is skipped, then the grid ends");
});

test("planPaste skips read-only columns and values that do not parse", () => {
  const writes = planPaste([["Row X", "Nope", "Gamma", "maybe", "12", "today"]], { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0 }, PAGES, PROPS);
  assert.deepEqual(writes, [
    { pageId: "p1", propId: "title", value: "Row X" },
    { pageId: "p1", propId: "cost", value: 12 },
  ]);
});

test("planClear empties every writable cell in the range", () => {
  const writes = planClear({ rowStart: 0, rowEnd: 1, colStart: 3, colEnd: 5 }, PAGES, PROPS);
  assert.deepEqual(writes, [
    { pageId: "p0", propId: "done", value: false },
    { pageId: "p0", propId: "cost", value: "" },
    { pageId: "p1", propId: "done", value: false },
    { pageId: "p1", propId: "cost", value: "" },
  ]);
});
