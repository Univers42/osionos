/* ************************************************************************** */
/*  live-aggregate-matrix.test.ts — op=aggregate wire-shape parsing           */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { matrixFromRows } from "../../src/shared/notion-database-sys/src/store/live/liveAggregateParse.ts";

test("aggregate-matrix: single groupBy rows parse to cells", () => {
  const rows = [
    { status: "active", v: 42 },
    { status: "churned", v: 7 },
  ];
  assert.deepEqual(matrixFromRows(rows, "status", undefined, "v"), [
    { x: "active", sub: null, value: 42 },
    { x: "churned", sub: null, value: 7 },
  ]);
});

test("aggregate-matrix: 2-column groupBy keeps the breakdown column", () => {
  const rows = [
    { region: "eu", tier: "pro", v: 10 },
    { region: "eu", tier: "free", v: 4 },
    { region: "us", tier: "pro", v: 6 },
  ];
  const cells = matrixFromRows(rows, "region", "tier", "v");
  assert.deepEqual(cells, [
    { x: "eu", sub: "pro", value: 10 },
    { x: "eu", sub: "free", value: 4 },
    { x: "us", sub: "pro", value: 6 },
  ]);
});

test("aggregate-matrix: NULL group values become null keys", () => {
  const rows = [
    { status: null, v: 3 },
    { status: "active", tier: null, v: 5 },
  ];
  assert.deepEqual(matrixFromRows(rows, "status", "tier", "v"), [
    { x: null, sub: null, value: 3 },
    { x: "active", sub: null, value: 5 },
  ]);
});

test("aggregate-matrix: numeric strings and missing aliases coerce safely", () => {
  const rows = [
    { status: "active", v: "12.5" }, // pg SUM can come back as a string
    { status: "churned" },           // missing alias → 0
  ];
  const cells = matrixFromRows(rows, "status", undefined, "v");
  assert.equal(cells[0].value, 12.5);
  assert.equal(cells[1].value, 0);
});
