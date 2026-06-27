/* ************************************************************************** */
/*  conditional-color.test.ts — rule evaluation + chart color overrides      */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  colorForPage, applyConditionalChartColors, conditionalColorToken,
} from "../../src/shared/notion-database-sys/src/lib/conditionalColor.ts";
import type { ConditionalColorRule } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";
import type {
  DatabaseSchema, Page,
} from "../../src/shared/notion-database-sys/src/component/types.ts";
import type { ChartResult } from "../../src/shared/notion-database-sys/src/lib/chart/chartTypes.ts";

const PROPS: DatabaseSchema["properties"] = {
  status: {
    id: "status", name: "Status", type: "select",
    options: [
      { id: "opt-done", value: "Done", color: "green" },
      { id: "opt-todo", value: "Todo", color: "gray" },
    ],
  },
  total: { id: "total", name: "Total", type: "number" },
};

function page(properties: Page["properties"]): Page {
  return {
    id: "p1", databaseId: "db", properties, content: [],
    createdAt: "", updatedAt: "", createdBy: "", lastEditedBy: "",
  };
}

function rule(overrides: Partial<ConditionalColorRule>): ConditionalColorRule {
  return { id: "r1", propertyId: "status", operator: "equals", value: "opt-done", color: "green", ...overrides };
}

test("conditional-color: first matching rule wins, no match → null", () => {
  const rules = [
    rule({ id: "r1", value: "opt-done", color: "green" }),
    rule({ id: "r2", operator: "is_not_empty", value: "", color: "red" }),
  ];
  assert.equal(colorForPage(page({ status: "opt-done" }), rules, PROPS)?.id, "green");
  assert.equal(colorForPage(page({ status: "opt-todo" }), rules, PROPS)?.id, "red");
  assert.equal(colorForPage(page({}), rules, PROPS), null);
});

test("conditional-color: numeric operators work through evaluateFilter", () => {
  const rules = [rule({ propertyId: "total", operator: "greater_than", value: 100, color: "red" })];
  assert.equal(colorForPage(page({ total: 250 }), rules, PROPS)?.id, "red");
  assert.equal(colorForPage(page({ total: 50 }), rules, PROPS), null);
});

test("conditional-color: unknown property or token degrades to null", () => {
  assert.equal(colorForPage(page({ x: 1 }), [rule({ propertyId: "ghost" })], PROPS), null);
  assert.equal(conditionalColorToken("not-a-token"), null);
  assert.equal(colorForPage(page({ status: "opt-done" }), [rule({ color: "not-a-token" })], PROPS), null);
});

test("conditional-color: chart categories/series get equals-rule colors", () => {
  const result: ChartResult = {
    categories: [
      { key: "opt-done", label: "Done", color: "", values: { value: 2 }, pageIds: {} },
      { key: "opt-todo", label: "Todo", color: "", values: { value: 1 }, pageIds: {} },
    ],
    series: [{ key: "value", label: "Count", color: "" }],
    total: 3,
  } as unknown as ChartResult;
  const settings = {
    xAxisProperty: "status",
    conditionalColors: [rule({ value: "opt-done", color: "green" })],
  };
  const colored = applyConditionalChartColors(result, settings, PROPS);
  assert.equal(colored.categories[0].color, conditionalColorToken("green")?.chart);
  assert.equal(colored.categories[1].color, "");
  // label-keyed matching: a rule whose value is the option LABEL also lands
  const byLabel = applyConditionalChartColors(result, {
    xAxisProperty: "status",
    conditionalColors: [rule({ value: "Done", color: "red" })],
  }, PROPS);
  assert.equal(byLabel.categories[0].color, conditionalColorToken("red")?.chart);
  // no rules → same reference
  assert.equal(applyConditionalChartColors(result, {}, PROPS), result);
});
