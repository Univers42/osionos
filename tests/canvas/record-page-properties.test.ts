/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   record-page-properties.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+    */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A row opened as a page must show what the table shows: option LABELS, an
// input-sized date and the computed formula/rollup values. And an edit made in
// that page must translate back to the engine's raw shape (ids, ISO dates), so
// projecting the row again never produces a write.

import assert from "node:assert/strict";
import test from "node:test";

import {
  projectRecordProperties,
  recordPropertyEdits,
  type DatabasePage,
  type DatabaseSchema,
  type RecordValueResolver,
} from "../../src/widgets/database-view/model/recordPageProperties.ts";
import type { PagePropertyEntry } from "../../src/entities/page/model/types.ts";

const STAGE = [
  { id: "stage-lead", value: "Lead", color: "gray" },
  { id: "stage-proposal", value: "Proposal", color: "orange" },
  { id: "stage-won", value: "Won", color: "green" },
];

const HEALTH = [
  { id: "health-on-track", value: "On track", color: "green" },
  { id: "health-at-risk", value: "At risk", color: "red" },
];

const PRODUCTS = [
  { id: "prod-whiteboard", value: "Whiteboard", color: "blue" },
  { id: "prod-databases", value: "Databases", color: "purple" },
  { id: "prod-crm", value: "CRM", color: "pink" },
];

const database = {
  id: "db-deals",
  name: "Deals",
  titlePropertyId: "title",
  properties: {
    title: { id: "title", name: "Name", type: "title" },
    notes: { id: "notes", name: "Notes", type: "text" },
    amount: { id: "amount", name: "Amount", type: "number" },
    strategic: { id: "strategic", name: "Strategic", type: "checkbox" },
    stage: { id: "stage", name: "Stage", type: "select", options: STAGE },
    health: { id: "health", name: "Health", type: "status", options: HEALTH },
    products: { id: "products", name: "Products", type: "multi_select", options: PRODUCTS },
    created: { id: "created", name: "Created", type: "date" },
    close: { id: "close", name: "Close date", type: "due_date" },
    createdTime: { id: "createdTime", name: "Created time", type: "created_time" },
    editedTime: { id: "editedTime", name: "Edited time", type: "last_edited_time" },
    website: { id: "website", name: "Website", type: "url" },
    email: { id: "email", name: "Email", type: "email" },
    phone: { id: "phone", name: "Phone", type: "phone" },
    hq: { id: "hq", name: "HQ", type: "place" },
    contacts: { id: "contacts", name: "Contacts", type: "relation" },
    weighted: {
      id: "weighted",
      name: "Weighted",
      type: "formula",
      formulaConfig: { expression: "amount * 2" },
    },
    tasks: { id: "tasks", name: "Open tasks", type: "rollup" },
    legacy: { id: "legacy", name: "Legacy", type: "custom" },
  },
} as unknown as DatabaseSchema;

const page = {
  id: "row-lion",
  databaseId: "db-deals",
  content: [],
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-20T12:00:00.000Z",
  createdBy: "user-1",
  lastEditedBy: "user-1",
  properties: {
    title: "Lion City Health",
    notes: "Enterprise deal",
    amount: 120000,
    strategic: true,
    stage: "stage-proposal",
    health: "health-on-track",
    products: ["prod-whiteboard", "prod-databases"],
    created: "2026-11-06T09:00:00.000Z",
    close: "2026-11-20T17:30:00.000Z",
    createdTime: "2026-10-01T08:00:00.000Z",
    editedTime: "2026-10-20T12:00:00.000Z",
    website: "https://lioncity.example.com",
    email: "hello@lioncity.example.com",
    phone: "+33 6 12 34 56 78",
    hq: { address: "Reims", lat: 49.2583, lng: 4.0317 },
    contacts: ["row-1", "row-2"],
    legacy: "legacy-value",
  },
} as unknown as DatabasePage;

const resolver: RecordValueResolver = {
  formula: (property) => (property.id === "weighted" ? 42 : null),
  rollup: (property) => (property.id === "tasks" ? 3 : null),
  // row-2 was deleted from the related table.
  title: (rowId) => (rowId === "row-1" ? "Ada Lovelace" : null),
};

function entry(key: string): PagePropertyEntry {
  const found = projectRecordProperties(database, page, resolver).find((item) => item.key === key);
  assert.ok(found, `missing projected property ${key}`);
  return found;
}

/** Edit ONE entry of the projection; every other entry stays untouched. */
function editsAfter(key: string, value: PagePropertyEntry["value"]) {
  const entries = projectRecordProperties(database, page, resolver).map((item) =>
    item.key === key ? { ...item, value } : item,
  );
  return recordPropertyEdits(database, page, entries);
}

test("projection: id-shaped select values show their labels", () => {
  assert.equal(entry("stage").type, "select");
  assert.equal(entry("stage").value, "Proposal");
  assert.equal(entry("health").type, "status");
  assert.equal(entry("health").value, "On track");
});

test("projection: multi_select is a label array with its own type", () => {
  assert.equal(entry("products").type, "multi_select");
  assert.deepEqual(entry("products").value, ["Whiteboard", "Databases"]);
});

test("projection: dates are YYYY-MM-DD and computed values are text", () => {
  assert.equal(entry("created").value, "2026-11-06");
  assert.equal(entry("close").value, "2026-11-20");
  assert.equal(entry("createdTime").value, "2026-10-01");
  assert.equal(entry("weighted").value, "42");
  assert.equal(entry("tasks").value, "3");
  assert.equal(entry("hq").value, "Reims");
});

test("round-trip: projecting then reading back produces no edit", () => {
  const projected = projectRecordProperties(database, page, resolver);
  assert.deepEqual(recordPropertyEdits(database, page, projected), []);
});

test("edits: a select label maps to its option id", () => {
  assert.deepEqual(editsAfter("stage", "Won"), [{ propertyId: "stage", value: "stage-won" }]);
});

test("edits: clearing a select writes null", () => {
  assert.deepEqual(editsAfter("stage", null), [{ propertyId: "stage", value: null }]);
  assert.deepEqual(editsAfter("stage", ""), [{ propertyId: "stage", value: null }]);
});

test("edits: an unknown select label is ignored", () => {
  assert.deepEqual(editsAfter("stage", "Nope"), []);
});

test("edits: a new day keeps the existing time", () => {
  assert.deepEqual(editsAfter("created", "2026-11-07"), [
    { propertyId: "created", value: "2026-11-07T09:00:00.000Z" },
  ]);
});

test("edits: multi_select labels map to their option ids", () => {
  assert.deepEqual(editsAfter("products", ["Whiteboard", "Databases", "CRM"]), [
    { propertyId: "products", value: ["prod-whiteboard", "prod-databases", "prod-crm"] },
  ]);
});

test("edits: number and checkbox changes pass through", () => {
  assert.deepEqual(editsAfter("amount", 150000), [{ propertyId: "amount", value: 150000 }]);
  assert.deepEqual(editsAfter("strategic", false), [{ propertyId: "strategic", value: false }]);
});

test("edits: computed properties are read-only", () => {
  assert.deepEqual(editsAfter("weighted", "99"), []);
  assert.deepEqual(editsAfter("tasks", "9"), []);
});

/** A row whose select stores a LABEL and whose multi_select holds an unknown id. */
function legacyPage(): DatabasePage {
  return {
    ...page,
    properties: {
      ...page.properties,
      stage: "Proposal",
      products: ["prod-whiteboard", "prod-retired"],
    },
  } as unknown as DatabasePage;
}

test("a row with legacy and unknown values opens without a write", () => {
  const legacy = legacyPage();
  const projected = projectRecordProperties(database, legacy, resolver);
  assert.deepEqual(recordPropertyEdits(database, legacy, projected), []);
});

test("removing one tag keeps an unknown id", () => {
  const legacy = legacyPage();
  const entries = projectRecordProperties(database, legacy, resolver).map((item) =>
    item.key === "products"
      ? { ...item, value: (item.value as string[]).filter((label) => label !== "Whiteboard") }
      : item,
  );
  assert.deepEqual(recordPropertyEdits(database, legacy, entries), [
    { propertyId: "products", value: ["prod-retired"] },
  ]);
});

// #162: the record page showed what the table could not keep — a second "Name" row,
// related rows as "Untitled" chips, and computed values the page let you edit and then dropped.
test("the title is the page's own title, not a second property row", () => {
  const keys = projectRecordProperties(database, page, resolver).map((item) => item.key);
  assert.ok(!keys.includes("title"), keys.join(", "));
});

test("relations show the related rows' titles, and a deleted row is dropped like the table does", () => {
  const contacts = entry("contacts");
  assert.deepEqual(contacts.value, ["Ada Lovelace"]);
  assert.equal(contacts.relationTarget, "database");
});

test("values the table owns are shown read-only; the ones it stores stay editable", () => {
  for (const key of ["weighted", "tasks", "createdTime", "editedTime", "contacts", "hq", "legacy"]) {
    assert.equal(entry(key).readOnly, true, key);
  }
  for (const key of ["notes", "amount", "strategic", "stage", "products", "created", "website"]) {
    assert.ok(!entry(key).readOnly, key);
  }
});
