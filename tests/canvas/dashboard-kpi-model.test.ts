/* ************************************************************************** */
/*  dashboard-kpi-model.test.ts — KPI tile number, format and provenance      */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregate, formatKpi, kpiProvenance, numericValues, whereFilterLabel,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/kpiModel.ts";

test("empty, null and boolean cells are not zeros", () => {
  assert.deepEqual(numericValues([1, "2", "", null, undefined, true, "x", 3.5]), [1, 2, 3.5]);
});

test("aggregates over numbers; nothing to aggregate is 0", () => {
  assert.equal(aggregate("sum", [1, 2, 3]), 6);
  assert.equal(aggregate("avg", [1, 2]), 1.5);
  assert.equal(aggregate("min", [4, -2, 9]), -2);
  assert.equal(aggregate("max", [4, -2, 9]), 9);
  assert.equal(aggregate("avg", []), 0);
});

test("compact from 10K, otherwise at most two decimals", () => {
  assert.equal(formatKpi(52.3456), "52.35");
  assert.equal(formatKpi(9999), (9999).toLocaleString());
  assert.equal(formatKpi(15_700), "15.7K");
  assert.equal(formatKpi(1_400_000), "1.4M");
});

test("a count names its share of the database", () => {
  assert.equal(kpiProvenance({ fn: "count", matched: 31, total: 55 }), "56% of 55 records");
  assert.equal(kpiProvenance({ fn: "count", matched: 55, total: 55 }), "All 55 records");
  assert.equal(kpiProvenance({ fn: "count", matched: 1, total: 0 }), "All 1 record");
});

test("an aggregate names its property and record base", () => {
  assert.equal(
    kpiProvenance({ fn: "sum", matched: 11, total: 55, propertyName: "Points" }),
    "Sum of Points · 11 records",
  );
  assert.equal(kpiProvenance({ fn: "avg", matched: 1, total: 55 }), "Average of — · 1 record");
});

test("a where-filter reads as words, with the option's label for a select", () => {
  const properties = {
    status: { id: "status", name: "Status", type: "select", options: [{ id: "opt-accepted", value: "accepted", color: "green" }] },
    done: { id: "done", name: "Done", type: "checkbox" },
  } as const;
  const where = (propertyId: string, operator: string, value: unknown) => [{ id: "f", propertyId, operator, value }] as never;
  assert.equal(whereFilterLabel(where("status", "equals", "opt-accepted"), properties), "Status is accepted");
  assert.equal(whereFilterLabel(where("status", "equals", "accepted"), properties), "Status is accepted");
  assert.equal(whereFilterLabel(where("done", "is_not_checked", true), properties), "Done is not checked");
  assert.equal(whereFilterLabel([], properties), undefined);
});
