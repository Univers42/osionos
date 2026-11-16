/* ************************************************************************** */
/*  requested-database.test.ts — opening a database always lands on a view     */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { withRequestedDatabase } from "../../src/shared/notion-database-sys/src/store/requestedDatabase.ts";
import type { NotionState } from "../../src/shared/notion-database-sys/src/component/types.ts";

const probe: NotionState = {
  databases: {
    "db-probe": {
      id: "db-probe", name: "Probe2", icon: "x", titlePropertyId: "db-probe-title",
      properties: {
        "db-probe-text": { id: "db-probe-text", name: "Text", type: "text" },
        "db-probe-title": { id: "db-probe-title", name: "Name", type: "title" },
      },
    },
  },
  pages: { r1: { id: "r1", databaseId: "db-probe", properties: {}, content: [], createdAt: "", updatedAt: "", createdBy: "", lastEditedBy: "" } },
  views: {},
};

test("a known database with no view gets the requested Table view, every column shown", () => {
  const out = withRequestedDatabase(probe, "db-probe", "db-probe-table");
  const view = out.views["db-probe-table"];
  assert.ok(view, "the requested view exists");
  assert.equal(view.databaseId, "db-probe");
  assert.equal(view.type, "table");
  assert.deepEqual(view.visibleProperties, ["db-probe-title", "db-probe-text"]);
  assert.equal(out.databases, probe.databases, "the schema is untouched");
  assert.equal(out.pages, probe.pages, "no starter row is added to a database that has rows");
});

test("a known database that has a view is returned unchanged", () => {
  const withView = withRequestedDatabase(probe, "db-probe", "db-probe-table");
  assert.equal(withRequestedDatabase(withView, "db-probe", "another-view"), withView);
});

test("an unknown database is materialized with a starter row and the requested view", () => {
  const out = withRequestedDatabase({ databases: {}, pages: {}, views: {} }, "db-new", "db-new-table", "Fresh");
  assert.equal(out.databases["db-new"].name, "Fresh");
  assert.deepEqual(out.views["db-new-table"].visibleProperties, ["db-new-title"]);
  assert.equal(Object.values(out.pages).filter((p) => p.databaseId === "db-new").length, 1);
});

test("no requested database leaves the state as loaded", () => {
  assert.equal(withRequestedDatabase(probe), probe);
});
