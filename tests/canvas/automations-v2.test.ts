/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   automations-v2.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Automations v2 (docs/superpowers/specs/2026-10-27-automations-v2-design.md):
// a rule is a trigger, conditions and a button program, stored on the
// database. These pin the matcher, the chained runner and the v1 migration.

import assert from "node:assert/strict";
import test from "node:test";

import { ruleMatches } from "../../src/shared/notion-database-sys/src/lib/automations/ruleMatch.ts";
import { MAX_CHAIN_DEPTH, runAutomations } from "../../src/shared/notion-database-sys/src/lib/automations/runAutomations.ts";
import type { AutomationEventV2, AutomationHost } from "../../src/shared/notion-database-sys/src/lib/automations/runAutomations.ts";
import { migrateAutomations } from "../../src/shared/notion-database-sys/src/lib/automations/migrateAutomations.ts";
import { parseButtonProgram } from "../../src/shared/notion-database-sys/src/lib/program/buttonProgram.ts";
import type {
  AutomationRule, AutomationRuleV2, AutomationTrigger, DatabaseSchema, Filter, Page, ViewConfig,
} from "../../src/shared/notion-database-sys/src/types/database.ts";
import type { ProgramAction } from "../../src/shared/notion-database-sys/src/lib/program/buttonProgram.ts";

const row = (id: string, properties: Record<string, unknown> = {}) =>
  ({ id, databaseId: "tasks", properties }) as unknown as Page;

const rule = (id: string, trigger: AutomationTrigger, actions: ProgramAction[] = [], conditions: Filter[] = []): AutomationRuleV2 => ({
  version: 2, id, name: id, enabled: true, ownerId: "owner", trigger, conditions, conjunction: "and",
  program: { version: 1, steps: actions.map((action) => ({ op: "action", action })) },
  updatedAt: "2026-10-27T00:00:00.000Z",
});

const changed = (before: Page, after: Page, ...ids: string[]): AutomationEventV2 =>
  ({ type: "property_changed", page: after, before, changed: ids });

const filter = (propertyId: string, operator: Filter["operator"], value: unknown): Filter =>
  ({ id: `${propertyId}-${operator}`, propertyId, operator, value });

test("a rule fires only on its own trigger, and never when off", () => {
  const added: AutomationEventV2 = { type: "row_added", page: row("r") };
  assert.equal(ruleMatches(rule("a", { type: "row_added" }), added), true);
  assert.equal(ruleMatches(rule("d", { type: "row_deleted" }), added), false);
  assert.equal(ruleMatches({ ...rule("a", { type: "row_added" }), enabled: false }, added), false);
});

test("property changes: any property, one property, and from → to", () => {
  const before = row("r", { status: "todo", owner: "ana" });
  const after = row("r", { status: "done", owner: "ana" });
  const event = changed(before, after, "status");
  assert.equal(ruleMatches(rule("any", { type: "property_changed" }), event), true);
  assert.equal(ruleMatches(rule("status", { type: "property_changed", propertyId: "status" }), event), true);
  assert.equal(ruleMatches(rule("owner", { type: "property_changed", propertyId: "owner" }), event), false);
  assert.equal(ruleMatches(rule("to", { type: "property_changed", propertyId: "status", to: "Done" }), event), true);
  assert.equal(ruleMatches(rule("to-other", { type: "property_changed", propertyId: "status", to: "doing" }), event), false);
  assert.equal(ruleMatches(rule("from", { type: "property_changed", propertyId: "status", from: "todo", to: "done" }), event), true);
  assert.equal(ruleMatches(rule("from-other", { type: "property_changed", propertyId: "status", from: "doing" }), event), false);
});

test("conditions read the row after the change, with and / or", () => {
  const event: AutomationEventV2 = { type: "row_added", page: row("r", { points: 5, owner: "" }) };
  const big = filter("points", "greater_than", 3);
  const owned = filter("owner", "is_not_empty", null);
  assert.equal(ruleMatches(rule("and", { type: "row_added" }, [], [big, owned]), event), false);
  assert.equal(ruleMatches({ ...rule("or", { type: "row_added" }, [], [big, owned]), conjunction: "or" }, event), true);
  assert.equal(ruleMatches(rule("half-built", { type: "row_added" }, [], [filter("points", "equals", "")]), event), false);
});

interface Harness { host: AutomationHost; writes: string[]; actions: string[] }

// A host whose set_property writes a row in memory and reports the change it
// caused, as the store will.
function harness(rules: AutomationRuleV2[], pages: Record<string, Page>): Harness {
  const writes: string[] = [];
  const actions: string[] = [];
  const host: AutomationHost = {
    rules: () => rules,
    propsOf: (event) => ({ ...event.page.properties }),
    evaluateFormula: () => null,
    now: () => 0,
    async runAction(action, { event }) {
      actions.push(action.type === "page_action" ? action.name : action.type);
      if (action.type !== "set_property") return { status: "ok" };
      const before = pages[event.page.id];
      const after = { ...before, properties: { ...before.properties, [action.property]: action.value } } as Page;
      pages[event.page.id] = after;
      writes.push(`${event.page.id}.${action.property}=${String(action.value)}`);
      return { status: "ok", caused: changed(before, after, action.property) };
    },
  };
  return { host, writes, actions };
}

const set = (property: string, value: string): ProgramAction => ({ type: "set_property", property, value });

test("a write starts the rules it matches, to a chain depth of 3", async () => {
  assert.equal(MAX_CHAIN_DEPTH, 3);
  const pages = { r: row("r") };
  const step = (from: string, to: string) =>
    rule(`${from}->${to}`, { type: "property_changed", propertyId: from }, [set(to, "x")]);
  const rules = [rule("start", { type: "row_added" }, [set("a", "x")]), step("a", "b"), step("b", "c"), step("c", "d")];
  const { host, writes } = harness(rules, pages);
  const runs = await runAutomations({ type: "row_added", page: pages.r }, host);
  assert.deepEqual(runs.map((run) => [run.ruleId, run.depth]), [["start", 1], ["a->b", 2], ["b->c", 3]]);
  assert.deepEqual(writes, ["r.a=x", "r.b=x", "r.c=x"]);
});

test("the same rule never runs twice on a row in one chain", async () => {
  const pages = { r: row("r") };
  const ping = rule("ping", { type: "property_changed" }, [set("n", "1")]);
  const { host, writes } = harness([ping], pages);
  const runs = await runAutomations(changed(pages.r, pages.r, "title"), host);
  assert.equal(runs.length, 1);
  assert.deepEqual(writes, ["r.n=1"]);
});

test("a rule may not run a destructive page action", async () => {
  const pages = { r: row("r") };
  const trash = rule("trash", { type: "row_added" }, [{ type: "page_action", name: "move_to_trash" }, set("after", "x")]);
  const { host, actions } = harness([trash], pages);
  const [run] = await runAutomations({ type: "row_added", page: pages.r }, host);
  assert.equal(run.status, "blocked");
  assert.deepEqual(actions, [], "neither the trash nor the step after it ran");
});

test("a run records its rule, row, trigger, status and steps", async () => {
  const pages = { r: row("r") };
  const { host } = harness([rule("note", { type: "row_added" }, [{ type: "notify", message: "hi" }])], pages);
  const [run] = await runAutomations({ type: "row_added", page: pages.r }, host);
  assert.equal(run.ruleId, "note");
  assert.equal(run.pageId, "r");
  assert.equal(run.trigger, "row_added");
  assert.equal(run.status, "ok");
  assert.deepEqual(run.log.map((entry) => entry.label), ["Notify"]);
});

test("a webhook step parses; one without a URL does not", () => {
  const parsed = parseButtonProgram({ version: 1, steps: [{ op: "action", action: { type: "webhook", url: "https://example.com/hook" } }] });
  assert.equal(parsed.ok, true);
  const bad = parseButtonProgram({ version: 1, steps: [{ op: "action", action: { type: "webhook", url: "" } }] });
  assert.equal(bad.ok, false);
});

const v1 = (id: string, extra: Partial<AutomationRule>): AutomationRule =>
  ({ id, name: id, enabled: true, table: "tasks", trigger: "row_added", actions: [], ...extra }) as AutomationRule;

const viewWith = (id: string, automations?: AutomationRule[]) =>
  ({ id, databaseId: "tasks", type: "table", settings: automations ? { automations } : {} }) as unknown as ViewConfig;

const DB = { id: "tasks", name: "Tasks", titlePropertyId: "title", properties: {} } as DatabaseSchema;

test("v1 rules move from the views onto the database, once", () => {
  const stamp = v1("stamp", {
    trigger: "row_updated", watchColumn: "status",
    condition: { column: "status", operator: "equals", value: "done" },
    actions: [{ type: "set_property", column: "finished", value: "yes" }, { type: "notify" }, { type: "webhook", url: "https://example.com/h" }],
  });
  const state = { databases: { tasks: DB }, views: { v1: viewWith("v1", [stamp]), v2: viewWith("v2", [stamp, v1("new", {})]) } };
  const migrated = migrateAutomations(state);
  const rules = migrated.databases.tasks.automations ?? [];
  assert.deepEqual(rules.map((r) => r.id), ["stamp", "new"], "a rule copied into two views moves once");
  assert.deepEqual(rules[0].trigger, { type: "property_changed", propertyId: "status" });
  assert.deepEqual(rules[0].conditions.map((c) => [c.propertyId, c.operator, c.value]), [["status", "equals", "done"]]);
  assert.deepEqual(rules[0].program.steps.map((s) => s.op === "action" && s.action), [
    { type: "set_property", property: "finished", value: "yes" },
    { type: "notify", message: "stamp" },
    { type: "webhook", url: "https://example.com/h" },
  ]);
  assert.equal(rules[0].ownerId, null);
  assert.equal(migrated.views.v1.settings?.automations, undefined);
  assert.equal(migrated.views.v2.settings?.automations, undefined);
  assert.equal(migrateAutomations(migrated), migrated, "a second pass changes nothing");
});

test("a database without v1 rules, or with v2 rules already, is left as it is", () => {
  const plain = { databases: { tasks: DB }, views: { v1: viewWith("v1") } };
  assert.equal(migrateAutomations(plain), plain);
  const done = { databases: { tasks: { ...DB, automations: [] } }, views: { v1: viewWith("v1", [v1("old", {})]) } };
  assert.equal(migrateAutomations(done), done);
});
