/* ************************************************************************** */
/*  automation-runner.test.ts — local automation planner (client fallback)   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  planAutomations, type AutomationEvent,
} from "../../src/shared/notion-database-sys/src/lib/automations/automationRunner.ts";
import type { AutomationRule, Page } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";

function page(properties: Page["properties"]): Page {
  return {
    id: "p1", databaseId: "db", properties, content: [],
    createdAt: "", updatedAt: "", createdBy: "", lastEditedBy: "",
  };
}

function rule(overrides: Partial<AutomationRule>): AutomationRule {
  return {
    id: "r1", name: "Rule", enabled: true, table: "db",
    trigger: "row_updated", actions: [{ type: "notify", message: "hi" }],
    ...overrides,
  };
}

function event(overrides: Partial<AutomationEvent> = {}): AutomationEvent {
  return { type: "row_updated", page: page({ status: "done", total: 5 }), ...overrides };
}

test("automation-runner: trigger + enabled gating", () => {
  const rules = [
    rule({ id: "match" }),
    rule({ id: "off", enabled: false }),
    rule({ id: "added-only", trigger: "row_added" }),
  ];
  const plan = planAutomations(rules, event());
  assert.equal(plan.notifications.length, 1);
  assert.equal(plan.notifications[0].ruleId, "match");
});

test("automation-runner: condition gates the rule", () => {
  const gated = rule({ condition: { column: "status", operator: "equals", value: "open" } });
  assert.equal(planAutomations([gated], event()).notifications.length, 0);
  const matching = rule({ condition: { column: "total", operator: "greater_than", value: 3 } });
  assert.equal(planAutomations([matching], event()).notifications.length, 1);
});

test("automation-runner: set_property plans a write, never on delete", () => {
  const setter = rule({ actions: [{ type: "set_property", column: "flag", value: "on" }] });
  const plan = planAutomations([setter], event());
  assert.deepEqual(plan.writes, [{ pageId: "p1", propertyId: "flag", value: "on" }]);
  const onDelete = planAutomations(
    [rule({ trigger: "row_deleted", actions: [{ type: "set_property", column: "flag", value: 1 }] })],
    event({ type: "row_deleted" }),
  );
  assert.equal(onDelete.writes.length, 0);
});

test("automation-runner: webhooks are server-only (skipped client-side)", () => {
  const hook = rule({ actions: [{ type: "webhook", url: "https://example.com" }] });
  const plan = planAutomations([hook], event());
  assert.equal(plan.writes.length + plan.notifications.length, 0);
});
