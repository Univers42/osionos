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

// The Library database: every item the viewer can reach is a row with a
// Category and a Scope, the shipped views are filters over those rows, and only
// a curator (owner or admin) gets an unlocked database and their own views.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page";
import type { PageAccessContext } from "@/shared/lib/auth/pageAccess";
import {
  canCurateLibrary, LIB, LIBRARY_DB_ID, LIBRARY_KIND_KEY, libraryCategory, libraryChildren, libraryRecords,
  librarySchema, readableLibraryPages, type LibrarySources,
} from "@/widgets/database-view/model/libraryDatabaseModel";
import { libraryViews, mergeLibraryViews } from "@/widgets/database-view/model/libraryViews";

const page = (id: string, extra: Partial<PageEntry> = {}): PageEntry =>
  ({ _id: id, title: id, workspaceId: "ws", updatedAt: "2026-10-01T00:00:00.000Z", ...extra }) as PageEntry;

const sources = (overrides: Partial<LibrarySources> = {}): LibrarySources => ({
  pages: [], recents: [], favoriteIds: [], databases: [], skills: [], agents: [], commands: [],
  ownerNames: new Map(), userId: "me", privateWorkspaceIds: new Set(["mine"]), ...overrides,
});

const cell = (records: ReturnType<typeof libraryRecords>, id: string, property: string) => records[id]?.properties[property];
const kind = (value: string) => ({ properties: [{ key: LIBRARY_KIND_KEY, label: "Kind", type: "select" as const, value }] });

test("a template is a Template whatever its surface, then the Kind, then the surface", () => {
  assert.equal(libraryCategory(page("t", { isTemplate: true, surface: "folder", ...kind("Rule") })), "Template");
  assert.equal(libraryCategory(page("r", { surface: "folder", ...kind("Rule") })), "Rule");
  assert.equal(libraryCategory(page("x", kind("Bogus"))), "Page");
  assert.equal(libraryCategory(page("f", { surface: "folder" })), "Folder");
  assert.equal(libraryCategory(page("a", { surface: "agent" })), "Agent");
  assert.equal(libraryCategory(page("p")), "Page");
});

test("pages, templates, databases, skills, agents and commands are all rows; archived pages are not", () => {
  const records = libraryRecords(sources({
    pages: [page("p"), page("t", { isTemplate: true }), page("gone", { archivedAt: "2026-10-02T00:00:00.000Z" })],
    databases: [{ id: "db-1", name: "Tasks", createdAt: Date.parse("2026-10-03T00:00:00.000Z") }],
    skills: [{ id: "s1", name: "Summarise", updatedAt: "2026-10-04T00:00:00.000Z" }],
    agents: [{ id: "a1", name: "Writer", scope: "builtin" }],
    commands: [{ name: "summarize" }],
  }));
  assert.deepEqual(Object.keys(records).sort(), ["agent:a1", "command:summarize", "db-1", "p", "skill:s1", "t"]);
  assert.equal(cell(records, "t", LIB.category), "opt-template");
  assert.equal(cell(records, "db-1", LIB.category), "opt-database");
  assert.equal(cell(records, "skill:s1", LIB.category), "opt-skill");
  assert.equal(cell(records, "agent:a1", LIB.category), "opt-agent");
  assert.equal(cell(records, "command:summarize", LIB.name), "/summarize");
  for (const record of Object.values(records)) assert.equal(record.databaseId, LIBRARY_DB_ID);
});

test("scope is where the item is stored: the private workspace or one's own unshared page is User", () => {
  const records = libraryRecords(sources({
    pages: [
      page("private-ws", { workspaceId: "mine", visibility: "shared" }),
      page("own-private", { ownerId: "ME" }),
      page("own-shared", { ownerId: "me", visibility: "shared" }),
      page("theirs", { ownerId: "them" }),
    ],
    agents: [{ id: "u", name: "U", scope: "user" }, { id: "w", name: "W", scope: "workspace" }, { id: "b", name: "B", scope: "builtin" }],
    skills: [{ id: "s", name: "S" }],
    commands: [{ name: "c" }],
  }));
  const scope = (id: string) => cell(records, id, LIB.scope);
  assert.deepEqual(
    ["private-ws", "own-private", "own-shared", "theirs", "agent:u", "agent:w", "agent:b", "skill:s", "command:c"].map(scope),
    ["opt-user", "opt-user", "opt-workspace", "opt-workspace", "opt-user", "opt-workspace", "opt-built-in", "opt-workspace", "opt-built-in"],
  );
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

const context = (overrides: Partial<PageAccessContext> = {}): PageAccessContext => ({
  userId: "me", workspaceIds: ["mine", "ws"], privateWorkspaceIds: ["mine"], sharedWorkspaceIds: ["ws"], ...overrides,
});

test("the Library lists only pages the viewer can read, from the workspaces asked for", () => {
  const byWorkspace = {
    ws: [page("shared", { visibility: "shared" }), page("theirs-private", { ownerId: "them" }), page("own", { ownerId: "me" })],
    mine: [page("note", { workspaceId: "mine", ownerId: "me" })],
    left: [page("gone", { workspaceId: "left", visibility: "shared" })],
  };
  const ids = (workspaceIds: string[], ctx: PageAccessContext | null) =>
    readableLibraryPages(byWorkspace, workspaceIds, ctx).map((entry) => entry._id);
  assert.deepEqual(ids(["ws", "mine", "ws"], context()), ["shared", "own", "note"]);
  assert.deepEqual(ids(["left"], context()), [], "a workspace the viewer left lists nothing");
  assert.deepEqual(ids(["ws"], null), [], "no session lists nothing");
});

test("the owner, an admin and the private workspace's owner curate; editors, viewers and settings.role do not", () => {
  const privateIds = new Set(["mine"]);
  const curates = (workspace: Parameters<typeof canCurateLibrary>[0]) => canCurateLibrary(workspace, "me", privateIds);
  assert.equal(curates({ _id: "mine", ownerId: "me" }), true);
  assert.equal(curates({ _id: "ws", ownerId: "other", role: "owner" }), true);
  assert.equal(curates({ _id: "ws", ownerId: "me" }), true);
  assert.equal(curates({ _id: "ws", ownerId: "other", role: "admin" }), true);
  assert.equal(curates({ _id: "ws", ownerId: "other", role: "editor" }), false);
  assert.equal(curates({ _id: "ws", ownerId: "other", role: "viewer" }), false);
  const settingsOnly = { _id: "ws", ownerId: "other", settings: { role: "owner" } } as unknown as Parameters<typeof canCurateLibrary>[0];
  assert.equal(curates(settingsOnly), false);
  assert.equal(curates(null), false);
});

test("the schema is locked for anyone who cannot curate, and the host always holds the lock", () => {
  assert.equal(librarySchema(false).locked, true);
  assert.equal(librarySchema(true).locked, false);
  assert.equal(librarySchema(false).locksManagedByHost, true);
  assert.equal(librarySchema(true).locksManagedByHost, true);
});

test("every view filters on a property and option the schema has; the Agents tab needs agents on", () => {
  const schema = librarySchema(true);
  const views = libraryViews(true);
  assert.deepEqual(Object.values(views).map((view) => view.name), [
    "All files", "Recents", "Favorites", "Shared", "Private", "User scope", "Workspace scope",
    "Templates", "Docs", "Rules", "Hooks", "Skills", "Agents", "Commands",
  ]);
  assert.equal(libraryViews(false)["v-library-agents"], undefined);
  assert.equal(Object.keys(libraryViews(false)).length, 13);
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

const CURATOR = { canCurate: true, withAgents: true };

test("a curator's views layer over the shipped ones; foreign or malformed ones are dropped", () => {
  const edited = { ...libraryViews(true)["v-library-all"], name: "Everything" };
  const own = { ...edited, id: "v-mine", name: "Mine" };
  const merged = mergeLibraryViews({
    "v-library-all": edited, "v-mine": own,
    "v-foreign": { ...own, databaseId: "other" }, "v-bad": "nope",
  }, CURATOR);
  assert.equal(merged["v-library-all"].name, "Everything");
  assert.equal(merged["v-mine"].name, "Mine");
  assert.equal(merged["v-foreign"], undefined);
  assert.equal(merged["v-bad"], undefined);
  assert.equal(merged["v-library-skills"].name, "Skills");
  assert.deepEqual(mergeLibraryViews("garbage", CURATOR), libraryViews(true));
});

test("anyone who cannot curate gets the shipped views whatever the browser holds; agents off drops the Agents view", () => {
  const stored = {
    "v-library-all": { ...libraryViews(true)["v-library-all"], filters: [] },
    "v-mine": { ...libraryViews(true)["v-library-all"], id: "v-mine" },
    "v-library-agents": { ...libraryViews(true)["v-library-agents"], name: "Bots" },
  };
  assert.deepEqual(mergeLibraryViews(stored, { canCurate: false, withAgents: true }), libraryViews(true));
  assert.equal(mergeLibraryViews(stored, { canCurate: true, withAgents: false })["v-library-agents"], undefined);
});

test("children are the live pages directly under a page", () => {
  const pages = [page("a"), page("b", { parentPageId: "a" }), page("c", { parentPageId: "b" }), page("d", { parentPageId: "a", archivedAt: "x" })];
  assert.deepEqual(libraryChildren(pages, "a").map((child) => child._id), ["b"]);
});
