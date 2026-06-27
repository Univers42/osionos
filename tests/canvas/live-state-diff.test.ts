/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-state-diff.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  diffLiveState,
  MAX_LIVE_ROW_OPS_PER_PERSIST,
} from "../../src/shared/notion-database-sys/src/store/live/liveStateDiff.ts";

const DB_ID = "baas:db-1:orders";
const OTHER_DB_ID = "baas:db-1:customers";

const PROPERTIES = {
  name: { id: "name", name: "Name", type: "title" },
  status: { id: "status", name: "Status", type: "select", options: [{ id: "paid", value: "paid", color: "c" }] },
  qty: { id: "qty", name: "Qty", type: "number" },
  raw: { id: "raw", name: "Raw", type: "id" }, // read-only render
};

type AnyState = Parameters<typeof diffLiveState>[0];

function page(id: string, databaseId: string, properties: Record<string, unknown>) {
  return {
    id, databaseId, properties, content: [],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "live", lastEditedBy: "live",
  };
}

function state(pages: ReturnType<typeof page>[], withDatabase = true): AnyState {
  return {
    databases: withDatabase
      ? { [DB_ID]: { id: DB_ID, name: "Orders", properties: structuredClone(PROPERTIES), titlePropertyId: "name" } }
      : {},
    pages: Object.fromEntries(pages.map((entry) => [entry.id, entry])),
    views: {},
  } as AnyState;
}

test("a cell edit produces exactly one cell change with the raw value", () => {
  const prev = state([page(`${DB_ID}:1`, DB_ID, { name: "A", qty: 2, status: "paid" })]);
  const next = state([page(`${DB_ID}:1`, DB_ID, { name: "A", qty: 3, status: "paid" })]);
  const diff = diffLiveState(next, prev, DB_ID);
  assert.deepEqual(diff.cellChanges, [{ table: "orders", pk: "1", column: "qty", value: 3 }]);
  assert.equal(diff.inserts.length + diff.deletes.length + diff.schemaAdds.length, 0);
});

test("cosmetic representation changes (same encoded value) never write", () => {
  const prev = state([page(`${DB_ID}:1`, DB_ID, { name: "A", qty: 2 })]);
  const next = state([page(`${DB_ID}:1`, DB_ID, { name: "A", qty: "2" })]); // string "2" encodes to 2
  assert.equal(diffLiveState(next, prev, DB_ID).cellChanges.length, 0);
});

test("read-only ('id') property edits are never diffed", () => {
  const prev = state([page(`${DB_ID}:1`, DB_ID, { name: "A", raw: "x" })]);
  const next = state([page(`${DB_ID}:1`, DB_ID, { name: "A", raw: "y" })]);
  assert.equal(diffLiveState(next, prev, DB_ID).cellChanges.length, 0);
});

test("a new UI row becomes an insert; server (baas:) rows never do", () => {
  const prev = state([]);
  const next = state([
    page("temp-uuid-1", DB_ID, { name: "New", qty: null, status: "" }),
    page(`${DB_ID}:9`, DB_ID, { name: "FromServer", qty: 1 }), // reload-surfaced server row
  ]);
  const diff = diffLiveState(next, prev, DB_ID);
  assert.equal(diff.inserts.length, 1);
  assert.deepEqual(diff.inserts[0], { table: "orders", values: { name: "New" }, tempId: "temp-uuid-1" });
});

test("a bulk batch of new rows is dropped as a load artifact (capped)", () => {
  const prev = state([]);
  const bulk = Array.from({ length: MAX_LIVE_ROW_OPS_PER_PERSIST + 1 }, (_, index) =>
    page(`temp-${index}`, DB_ID, { name: `n${index}` }));
  const diff = diffLiveState(state(bulk), prev, DB_ID);
  assert.equal(diff.inserts.length, 0);
  assert.equal(diff.skipped.length, 1);
  assert.match(diff.skipped[0], /load artifact/);
});

test("a vanished server row becomes a delete; bulk vanish is capped", () => {
  const prev = state([page(`${DB_ID}:1`, DB_ID, { name: "A" }), page(`${DB_ID}:2`, DB_ID, { name: "B" })]);
  const diff = diffLiveState(state([page(`${DB_ID}:1`, DB_ID, { name: "A" })]), prev, DB_ID);
  assert.deepEqual(diff.deletes, [{ table: "orders", pk: "2" }]);

  const many = Array.from({ length: MAX_LIVE_ROW_OPS_PER_PERSIST + 1 }, (_, index) =>
    page(`${DB_ID}:${index}`, DB_ID, { name: `n${index}` }));
  const bulk = diffLiveState(state([]), state(many), DB_ID);
  assert.equal(bulk.deletes.length, 0);
  assert.match(bulk.skipped[0], /load artifact/);
});

test("schema add / remove / retype on THIS database only", () => {
  const prev = state([]);
  const next = state([]);
  const nextDb = next.databases[DB_ID];
  nextDb.properties.priority = { id: "prop-1234", name: "Priority", type: "select", options: [] };
  delete nextDb.properties.qty;
  nextDb.properties.status = { ...nextDb.properties.status, type: "text" };
  const diff = diffLiveState(next, prev, DB_ID);
  assert.deepEqual(diff.schemaAdds.map((property) => property.id), ["prop-1234"]);
  assert.deepEqual(diff.schemaRemoves, ["qty"]);
  assert.deepEqual(diff.schemaRetypes.map((retype) => [retype.propertyId, retype.newType]), [["status", "text"]]);
});

test("cross-database isolation: other databases' pages and schemas are ignored", () => {
  const prev = state([page(`${OTHER_DB_ID}:5`, OTHER_DB_ID, { name: "X" })]);
  const next = state([page(`${OTHER_DB_ID}:5`, OTHER_DB_ID, { name: "CHANGED" })]);
  prev.databases[OTHER_DB_ID] = { id: OTHER_DB_ID, name: "C", properties: {}, titlePropertyId: "name" };
  next.databases[OTHER_DB_ID] = {
    id: OTHER_DB_ID, name: "C",
    properties: { extra: { id: "extra", name: "Extra", type: "text" } }, titlePropertyId: "name",
  };
  const diff = diffLiveState(next, prev, DB_ID);
  assert.equal(diff.cellChanges.length, 0);
  assert.equal(diff.schemaAdds.length, 0);
  assert.equal(diff.deletes.length + diff.inserts.length, 0);
});

test("first load (prev lacks the database) is never an edit", () => {
  const next = state([page(`${DB_ID}:1`, DB_ID, { name: "A" }), page("temp-1", DB_ID, { name: "B" })]);
  const diff = diffLiveState(next, state([], false), DB_ID);
  assert.equal(diff.cellChanges.length, 0);
  assert.equal(diff.inserts.length, 0);
  assert.equal(diff.schemaAdds.length, 0); // no add_column storm on first load
});
