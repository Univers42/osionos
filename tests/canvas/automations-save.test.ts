/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   automations-save.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import type {
  AutomationRuleV2, DatabaseSchema, ViewConfig,
} from "../../src/shared/notion-database-sys/src/types/database.ts";

const DB = (id: string): DatabaseSchema => ({
  id, name: "Tasks", titlePropertyId: "title",
  properties: { title: { id: "title", name: "Name", type: "title" } },
}) as DatabaseSchema;

const rule = (id: string): AutomationRuleV2 => ({
  version: 2, id, name: id, enabled: true, ownerId: "owner", trigger: { type: "row_added" },
  conditions: [], conjunction: "and", program: { version: 1, steps: [] }, updatedAt: "2026-10-27T00:00:00.000Z",
});

function storeWith() {
  const store = createDatabaseStore();
  const view = { id: "v", databaseId: "tasks", type: "table", settings: { automations: [{ id: "old", name: "old", enabled: true, table: "tasks", trigger: "row_added", actions: [] }] } } as unknown as ViewConfig;
  const database = Object.freeze(DB("tasks")) as DatabaseSchema;
  const frozenView = Object.freeze(view) as ViewConfig;
  store.setState({ databases: { tasks: database }, views: { v: frozenView }, pages: {} } as never);
  return store;
}

test("saveDatabaseAutomations writes rules onto the database", () => {
  const store = storeWith();
  const rules = [rule("r1")];
  store.getState().saveDatabaseAutomations("tasks", rules);
  assert.deepEqual(store.getState().databases.tasks.automations, rules);
});

test("saveDatabaseAutomations removes v1 view copies", () => {
  const store = storeWith();
  store.getState().saveDatabaseAutomations("tasks", [rule("r1")]);
  assert.equal(store.getState().views.v.settings?.automations, undefined);
});

test("saveDatabaseAutomations does not mutate the previous state objects", () => {
  const store = storeWith();
  const beforeDb = store.getState().databases.tasks;
  const beforeView = store.getState().views.v;
  store.getState().saveDatabaseAutomations("tasks", [rule("r1")]);
  // The original frozen objects must still be unchanged.
  assert.equal((beforeDb as { automations?: unknown }).automations, undefined);
  assert.ok((beforeView.settings as { automations?: unknown[] })?.automations?.length === 1);
});