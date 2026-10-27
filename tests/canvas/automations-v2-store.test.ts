/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   automations-v2-store.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The database store runs the v2 automations on its own row changes: a new
// row, a property edit and a deleted row each start the database's rules,
// and a rule's write goes through the same store, so it can chain.

import assert from "node:assert/strict";
import test from "node:test";

import { createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import type {
  AutomationRule, AutomationRuleV2, AutomationTrigger, DatabaseSchema, ProgramStep, ViewConfig,
} from "../../src/shared/notion-database-sys/src/types/database.ts";

const DB = (id: string, automations?: AutomationRuleV2[]): DatabaseSchema => ({
  id, name: "Tasks", titlePropertyId: "title",
  properties: {
    title: { id: "title", name: "Name", type: "title" },
    status: { id: "status", name: "Status", type: "text" },
    done: { id: "done", name: "Done at", type: "text" },
    note: { id: "note", name: "Note", type: "text" },
  },
  ...(automations ? { automations } : {}),
}) as DatabaseSchema;

const setStep = (property: string, value: string): ProgramStep =>
  ({ op: "action", action: { type: "set_property", property, value } });

const rule = (id: string, trigger: AutomationTrigger, steps: ProgramStep[]): AutomationRuleV2 => ({
  version: 2, id, name: id, enabled: true, ownerId: "owner", trigger, conditions: [], conjunction: "and",
  program: { version: 1, steps }, updatedAt: "2026-10-27T00:00:00.000Z",
});

function storeWith(databases: Record<string, DatabaseSchema>, views: Record<string, ViewConfig> = {}) {
  const store = createDatabaseStore();
  // The source is left as created: switching it writes the URL hash, which
  // node has no location for.
  store.setState({ databases, views, pages: {} } as never);
  return store;
}

// The runner is asynchronous: a rule's write lands after the edit that started it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a new row runs the database's row-added rules", async () => {
  const store = storeWith({ tasks: DB("tasks", [rule("triage", { type: "row_added" }, [setStep("status", "todo")])]) });
  const id = store.getState().addPage("tasks", {});
  await settle();
  const page = store.getState().pages[id];
  assert.equal(page.properties.status, "todo");
  assert.equal(page.lastEditedBy, "Automation");
});

test("a property edit runs from → to rules, and their writes chain", async () => {
  const store = storeWith({
    tasks: DB("tasks", [
      rule("stamp", { type: "property_changed", propertyId: "status", from: "todo", to: "done" }, [setStep("done", "yes")]),
      rule("log", { type: "property_changed", propertyId: "done" }, [setStep("Note", "stamped")]),
    ]),
  });
  const id = store.getState().addPage("tasks", { status: "todo" });
  store.getState().updatePageProperty(id, "status", "done");
  await settle();
  assert.equal(store.getState().pages[id].properties.done, "yes");
  assert.equal(store.getState().pages[id].properties.note, "stamped", "a step may name the property");
});

test("a rule whose trigger does not match leaves the row alone", async () => {
  const store = storeWith({ tasks: DB("tasks", [rule("stamp", { type: "property_changed", propertyId: "status", to: "done" }, [setStep("done", "yes")])]) });
  const id = store.getState().addPage("tasks", {});
  store.getState().updatePageProperty(id, "status", "doing");
  await settle();
  assert.equal(store.getState().pages[id].properties.done, undefined);
});

test("v1 rules still on a view run until the database has its own", async () => {
  const v1: AutomationRule = {
    id: "old", name: "old", enabled: true, table: "tasks", trigger: "row_added",
    actions: [{ type: "set_property", column: "status", value: "new" }],
  };
  const view = { id: "v", databaseId: "tasks", type: "table", settings: { automations: [v1] } } as unknown as ViewConfig;
  const store = storeWith({ tasks: DB("tasks") }, { v: view });
  const id = store.getState().addPage("tasks", {});
  await settle();
  assert.equal(store.getState().pages[id].properties.status, "new");
});

test("a live mount's rules are left to the server", async () => {
  const live = "baas:src:tasks";
  const store = storeWith({ [live]: DB(live, [rule("triage", { type: "row_added" }, [setStep("status", "todo")])]) });
  const id = store.getState().addPage(live, {});
  await settle();
  assert.equal(store.getState().pages[id].properties.status, undefined);
});
