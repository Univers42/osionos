// ADR 0064 PS20 + ADR 0065 CV15: a page made from a template takes the template's
// cover and cover position, only the keys the template has, never a cover-layout
// field, and its properties only inside the same database.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page/model/types";
import { createExtrasOf, templateCopyOptions } from "@/store/templateCopy";

const template = (extra: Partial<PageEntry>): PageEntry =>
  ({ _id: "tpl", title: "T", workspaceId: "ws", isTemplate: true, databaseId: null, ...extra }) as PageEntry;
const PROPS = [{ key: "status", label: "Status", type: "text" as const, value: "Draft" }];

test("the cover and its position are copied when the template has them", () => {
  assert.deepEqual(templateCopyOptions(template({ cover: "gradient:sunset", coverPosition: 30 }), null), { cover: "gradient:sunset", coverPosition: 30 });
});

test("only the keys the template has: a cover without a position copies no position", () => {
  assert.deepEqual(templateCopyOptions(template({ cover: "gradient:sunset" }), null), { cover: "gradient:sunset" });
  assert.deepEqual(templateCopyOptions(template({}), null), {});
});

test("a cover-layout field on the template is never copied (CV15)", () => {
  const copied = templateCopyOptions(template({ cover: "c", coverHeight: 320, coverWidth: "content" }), null);
  assert.deepEqual(Object.keys(copied).sort(), ["cover"]);
});

test("properties are copied only inside the same database", () => {
  assert.deepEqual(templateCopyOptions(template({ databaseId: "db1", properties: PROPS }), "db1").properties, PROPS);
  assert.equal("properties" in templateCopyOptions(template({ databaseId: "db1", properties: PROPS }), "db2"), false);
  assert.equal("properties" in templateCopyOptions(template({ databaseId: null, properties: PROPS }), null), false, "outside any database: unknown, stays out");
});

test("the copied properties are a copy, not the template's own array", () => {
  const copied = templateCopyOptions(template({ databaseId: "db1", properties: PROPS }), "db1").properties;
  assert.notEqual(copied, PROPS);
});

test("the create request carries only the extras that are set", () => {
  assert.deepEqual(createExtrasOf({}), {});
  assert.deepEqual(createExtrasOf({ icon: "x", cover: "c", coverPosition: 0 }), { cover: "c", coverPosition: 0 });
  assert.deepEqual(createExtrasOf({ properties: PROPS }), { properties: PROPS });
});
