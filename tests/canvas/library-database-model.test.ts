/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   library-database-model.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The Library database: every workspace item is a row with a Category, and the
// shipped views are filters over those rows.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page";
import {
  LIB, LIBRARY_DB_ID, libraryCategory, libraryChildren, libraryRecords, librarySchema, libraryViews,
  mergeLibraryViews, type LibrarySources,
} from "@/widgets/database-view/model/libraryDatabaseModel";

const page = (id: string, extra: Partial<PageEntry> = {}): PageEntry =>
  ({ _id: id, title: id, workspaceId: "ws", updatedAt: "2026-10-01T00:00:00.000Z", ...extra }) as PageEntry;

const sources = (overrides: Partial<LibrarySources> = {}): LibrarySources => ({
  pages: [], recents: [], favoriteIds: [], databases: [], skills: [], ownerNames: new Map(), ...overrides,
});

const category = (records: ReturnType<typeof libraryRecords>, id: string) => records[id]?.properties[LIB.category];

test("a template is a Template whatever its surface; other pages take their surface", () => {
  assert.equal(libraryCategory(page("t", { isTemplate: true, surface: "folder" })), "Template");
  assert.equal(libraryCategory(page("f", { surface: "folder" })), "Folder");
  assert.equal(libraryCategory(page("a", { surface: "agent" })), "Agent");
  assert.equal(libraryCategory(page("p")), "Page");
});

test("pages, templates, databases and skills are all rows; archived pages are not", () => {
  const records = libraryRecords(sources({
    pages: [page("p"), page("t", { isTemplate: true }), page("gone", { archivedAt: "2026-10-02T00:00:00.000Z" })],
    databases: [{ id: "db-1", name: "Tasks", createdAt: Date.parse("2026-10-03T00:00:00.000Z") }],
    skills: [{ id: "s1", name: "Summarise", updatedAt: "2026-10-04T00:00:00.000Z" }],
  }));
  assert.deepEqual(Object.keys(records).sort(), ["db-1", "p", "skill:s1", "t"]);
  assert.equal(category(records, "t"), "opt-template");
  assert.equal(category(records, "db-1"), "opt-database");
  assert.equal(category(records, "skill:s1"), "opt-skill");
  for (const record of Object.values(records)) assert.equal(record.databaseId, LIBRARY_DB_ID);
});

test("a row carries its location, access, owner, visit and favorite", () => {
  const records = libraryRecords(sources({
    pages: [page("root", { title: "Projects" }), page("child", { parentPageId: "root", visibility: "public", ownerId: "U1" })],
    recents: [{ id: "child", workspaceId: "ws", kind: "page", visitedAt: Date.parse("2026-10-05T00:00:00.000Z") }],
    favoriteIds: ["child"],
    ownerNames: new Map([["u1", "Ada"]]),
  }));
  const child = records.child.properties;
  assert.equal(child[LIB.location], "Projects");
  assert.equal(child[LIB.access], "opt-public");
  assert.equal(child[LIB.owner], "Ada");
  assert.equal(child[LIB.visited], "2026-10-05T00:00:00.000Z");
  assert.equal(child[LIB.favorite], true);
  assert.equal(records.root.properties[LIB.location], "");
  assert.equal(records.root.properties[LIB.access], "opt-private");
  assert.equal(records.root.properties[LIB.visited], null);
});

test("every view filters on a property and option the schema has", () => {
  const schema = librarySchema();
  const views = libraryViews();
  assert.deepEqual(Object.values(views).map((view) => view.name),
    ["All files", "Recents", "Favorites", "Shared", "Private", "Templates", "Skills"]);
  for (const view of Object.values(views)) {
    assert.equal(view.settings.tableStyle, "minimal");
    for (const rule of view.filters) {
      const property = schema.properties[rule.propertyId];
      assert.ok(property, `${view.name} filters on unknown ${rule.propertyId}`);
      if (typeof rule.value === "string") {
        assert.ok(property.options?.some((option) => option.id === rule.value), `${view.name}: no option ${String(rule.value)}`);
      }
    }
  }
});

test("a viewer's views layer over the shipped ones; foreign or malformed ones are dropped", () => {
  const edited = { ...libraryViews()["v-library-all"], name: "Everything" };
  const own = { ...edited, id: "v-mine", name: "Mine" };
  const merged = mergeLibraryViews({
    "v-library-all": edited, "v-mine": own,
    "v-foreign": { ...own, databaseId: "other" }, "v-bad": "nope",
  });
  assert.equal(merged["v-library-all"].name, "Everything");
  assert.equal(merged["v-mine"].name, "Mine");
  assert.equal(merged["v-foreign"], undefined);
  assert.equal(merged["v-bad"], undefined);
  assert.equal(merged["v-library-skills"].name, "Skills");
  assert.deepEqual(mergeLibraryViews("garbage"), libraryViews());
});

test("children are the live pages directly under a page", () => {
  const pages = [page("a"), page("b", { parentPageId: "a" }), page("c", { parentPageId: "b" }), page("d", { parentPageId: "a", archivedAt: "x" })];
  assert.deepEqual(libraryChildren(pages, "a").map((child) => child._id), ["b"]);
});
