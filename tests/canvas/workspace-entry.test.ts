/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-entry.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { pageIdForEntry } from "../../src/widgets/activity-rail/model/workspaceEntry.ts";

function page(
  _id: string,
  title: string,
  parentPageId: string | null,
  surface: PageEntry["surface"] = "page",
): PageEntry {
  return { _id, title, workspaceId: "ws", surface, parentPageId, archivedAt: null };
}

const workspaceId = "ws-test";

// A block page "Roadmap" → "Roadmap.omd"; its child "Roadmap/Q3.omd";
// a code page "src/main.ts" under folder "src"; a folder path "src" → the folder id.
const pages: PageEntry[] = [
  page("r", "Roadmap", null), // block page root
  page("q", "Q3", "r"), // child of Roadmap
  page("s", "src", null, "folder"), // folder
  page("m", "main.ts", "s", "code"), // code file under src
];

test("block page root path resolves to its id", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "Roadmap.omd"), "r");
});

test("block page child path resolves to its id", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "Roadmap/Q3.omd"), "q");
});

test("code page path resolves to its id", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "src/main.ts"), "m");
});

test("folder path resolves to the folder id", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "src"), "s");
});

test("leading slash is normalised", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "/Roadmap.omd"), "r");
  assert.equal(pageIdForEntry(workspaceId, pages, "/src/main.ts"), "m");
});

test("double slash is collapsed", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "Roadmap//Q3.omd"), "q");
  assert.equal(pageIdForEntry(workspaceId, pages, "src//main.ts"), "m");
});

test("empty string returns undefined", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, ""), undefined);
});

test("unknown path returns undefined", () => {
  assert.equal(pageIdForEntry(workspaceId, pages, "unknown.omd"), undefined);
  assert.equal(pageIdForEntry(workspaceId, pages, "src/unknown.ts"), undefined);
});

test("archived page path returns undefined", () => {
  const withArchived: PageEntry[] = [
    ...pages,
    { ...page("a", "Old", null), archivedAt: "2026-10-01T00:00:00Z" },
  ];
  assert.equal(pageIdForEntry(workspaceId, withArchived, "Old.omd"), undefined);
});