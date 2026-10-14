/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorer-row-identity.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { explorerIconValue } from "../../src/features/ide/model/explorerPageIcon.ts";
import { pageIdForEntry, pageIdForDir } from "../../src/widgets/activity-rail/model/workspaceEntry.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

function basePage(overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    _id: "page-1",
    title: "Test Page",
    workspaceId: "ws-1",
    ownerId: "user-1",
    visibility: "private",
    parentPageId: null,
    sortOrder: 0,
    databaseId: null,
    archivedAt: null,
    surface: "page",
    isTemplate: false,
    isDefaultTemplate: false,
    ...overrides,
  };
}

test("explorerIconValue returns undefined for no page", () => {
  assert.equal(explorerIconValue(undefined), undefined);
});

test("explorerIconValue returns page's own icon when non-empty", () => {
  const page = basePage({ icon: "icon:star", databaseId: null });
  assert.equal(explorerIconValue(page), "icon:star");
});

test("explorerIconValue falls back to icon:table for database page with empty icon", () => {
  const page = basePage({ icon: "", databaseId: "db-1" });
  assert.equal(explorerIconValue(page), "icon:table");
});

test("explorerIconValue falls back to icon:page for regular page with empty icon", () => {
  const page = basePage({ icon: "", databaseId: null });
  assert.equal(explorerIconValue(page), "icon:page");
});

test("explorerIconValue falls back to icon:page for page with undefined icon", () => {
  const page = basePage({ icon: undefined, databaseId: null });
  assert.equal(explorerIconValue(page), "icon:page");
});

test("pageIdForEntry finds page by exact path", () => {
  const ws = "ws-test-1";
  const pages: readonly PageEntry[] = [
    basePage({ _id: "roadmap", title: "Roadmap", workspaceId: ws, parentPageId: null }),
    basePage({ _id: "q3", title: "Q3", workspaceId: ws, parentPageId: "roadmap" }),
  ];
  assert.equal(pageIdForEntry(ws, pages, "Roadmap.omd"), "roadmap");
  assert.equal(pageIdForEntry(ws, pages, "Roadmap/Q3.omd"), "q3");
});

test("pageIdForEntry returns undefined for unknown path", () => {
  const ws = "ws-test-2";
  const pages: readonly PageEntry[] = [basePage({ _id: "roadmap", title: "Roadmap", workspaceId: ws })];
  assert.equal(pageIdForEntry(ws, pages, "Unknown.omd"), undefined);
});

test("pageIdForEntry returns undefined for empty path", () => {
  const ws = "ws-test-3";
  const pages: readonly PageEntry[] = [basePage({ _id: "roadmap", title: "Roadmap", workspaceId: ws })];
  assert.equal(pageIdForEntry(ws, pages, ""), undefined);
});

test("pageIdForDir finds page that owns the directory", () => {
  const ws = "ws-test-4";
  const pages: readonly PageEntry[] = [
    basePage({ _id: "roadmap", title: "Roadmap", workspaceId: ws, parentPageId: null }),
    basePage({ _id: "q3", title: "Q3", workspaceId: ws, parentPageId: "roadmap" }),
  ];
  assert.equal(pageIdForDir(ws, pages, "Roadmap"), "roadmap");
});

test("pageIdForDir returns undefined for unknown directory", () => {
  const ws = "ws-test-5";
  const pages: readonly PageEntry[] = [basePage({ _id: "roadmap", title: "Roadmap", workspaceId: ws })];
  assert.equal(pageIdForDir(ws, pages, "Unknown"), undefined);
});

test("pageIdForDir returns undefined for empty path", () => {
  const ws = "ws-test-6";
  const pages: readonly PageEntry[] = [basePage({ _id: "roadmap", title: "Roadmap", workspaceId: ws })];
  assert.equal(pageIdForDir(ws, pages, ""), undefined);
});

test("archived page is not found by pageIdForEntry", () => {
  const ws = "ws-test-7";
  const pages: readonly PageEntry[] = [
    basePage({ _id: "archived", title: "Archived", workspaceId: ws, archivedAt: "2024-01-01T00:00:00Z" }),
  ];
  assert.equal(pageIdForEntry(ws, pages, "Archived.omd"), undefined);
});

test("archived page is not found by pageIdForDir", () => {
  const ws = "ws-test-8";
  const pages: readonly PageEntry[] = [
    basePage({ _id: "archived", title: "Archived", workspaceId: ws, archivedAt: "2024-01-01T00:00:00Z" }),
  ];
  assert.equal(pageIdForDir(ws, pages, "Archived"), undefined);
});
