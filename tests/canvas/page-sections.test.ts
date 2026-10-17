/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-sections.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import {
  groupRootsBySection,
  realRelOf,
  sectionNamed,
  sectionOf,
  sectionOfRel,
  virtualRelOf,
  type SectionContext,
} from "../../src/features/page-file/model/pageSections.ts";

const OWN: SectionContext = { joinedWorkspace: false };
const JOINED: SectionContext = { joinedWorkspace: true };

function page(_id: string, parentPageId: string | null, extra: Partial<PageEntry> = {}): PageEntry {
  return { _id, title: _id, workspaceId: "ws", surface: "page", parentPageId, archivedAt: null, ...extra };
}

const byId = (pages: readonly PageEntry[]) => {
  const map = new Map(pages.map((p) => [p._id, p]));
  return (id: string) => map.get(id);
};

// sectionOf: the table the old sidebar's selectRootPageIds implied (8c738806^), one case per row.
const TABLE: Array<[string, PageEntry, SectionContext, "private" | "shared" | null]> = [
  ["owned private", page("a", null, { visibility: "private", ownerId: "me" }), OWN, "private"],
  ["owned, visibility unset", page("a", null, { ownerId: "me" }), OWN, "private"],
  ["ownerless offline seed page", page("a", null), OWN, "private"],
  ["owned shared", page("a", null, { visibility: "shared", ownerId: "me" }), OWN, "shared"],
  ["public stays private (old helper: only 'shared' is shared)", page("a", null, { visibility: "public", ownerId: "me" }), OWN, "private"],
  ["another user's shared page", page("a", null, { visibility: "shared", ownerId: "you" }), OWN, "shared"],
  ["another user's page in a joined workspace", page("a", null, { visibility: "private", ownerId: "you" }), JOINED, "shared"],
  ["my own page in a joined workspace", page("a", null, { visibility: "private", ownerId: "me" }), JOINED, "shared"],
  ["archived root", page("a", null, { archivedAt: "2026-10-01T00:00:00Z" }), OWN, null],
  ["home surface follows the same rule", page("a", null, { surface: "home" }), OWN, "private"],
];

for (const [name, subject, ctx, expected] of TABLE) {
  test(`sectionOf: ${name}`, () => {
    assert.equal(sectionOf(subject, ctx, byId([subject])), expected);
  });
}

test("sectionOf: a child follows its root, however deep, and never its own visibility", () => {
  const pages = [
    page("root-private", null, { visibility: "private" }),
    page("c1", "root-private", { visibility: "shared" }),
    page("c2", "c1", { visibility: "shared" }),
    page("root-shared", null, { visibility: "shared" }),
    page("d1", "root-shared", { visibility: "private" }),
  ];
  const lookup = byId(pages);
  assert.equal(sectionOf(pages[2], OWN, lookup), "private");
  assert.equal(sectionOf(pages[1], OWN, lookup), "private");
  assert.equal(sectionOf(pages[4], OWN, lookup), "shared");
});

test("sectionOf: an archived child or an archived ancestor is excluded", () => {
  const pages = [
    page("r", null, { archivedAt: "2026-10-01T00:00:00Z" }),
    page("c", "r"),
    page("live", null),
    page("gone", "live", { archivedAt: "2026-10-01T00:00:00Z" }),
  ];
  const lookup = byId(pages);
  assert.equal(sectionOf(pages[1], OWN, lookup), null);
  assert.equal(sectionOf(pages[3], OWN, lookup), null);
});

test("sectionOf: an orphan (parent missing) and a parent cycle terminate", () => {
  const orphan = page("o", "missing", { visibility: "shared" });
  assert.equal(sectionOf(orphan, OWN, byId([orphan])), "shared");
  const a = page("a", "b");
  const b = page("b", "a");
  assert.equal(sectionOf(a, OWN, byId([a, b])), "private");
});

test("groupRootsBySection: roots only, per section, empty input gives two empty groups", () => {
  assert.deepEqual(groupRootsBySection([], OWN), { private: [], shared: [] });
  const pages = [
    page("p1", null),
    page("s1", null, { visibility: "shared" }),
    page("kid", "s1"),
    page("gone", null, { archivedAt: "2026-10-01T00:00:00Z" }),
  ];
  const groups = groupRootsBySection(pages, OWN);
  assert.deepEqual(groups.private.map((p) => p._id), ["p1"]);
  assert.deepEqual(groups.shared.map((p) => p._id), ["s1"]);
  assert.deepEqual(groupRootsBySection(pages, JOINED).private, []);
});

// Display-layer path translation. The REAL paths (pageIndex/pagePaths) are never changed.
test("path translation: the real path is untouched, only the display layer prefixes", () => {
  assert.equal(virtualRelOf("private", "Roadmap.omd"), "Private/Roadmap.omd");
  assert.equal(virtualRelOf("shared", "Roadmap/Q3.omd"), "Shared/Roadmap/Q3.omd");
  assert.equal(realRelOf("Private/Roadmap.omd"), "Roadmap.omd");
  assert.equal(realRelOf("Shared/Roadmap/Q3.omd"), "Roadmap/Q3.omd");
});

test("path translation round-trips for both sections, including the section dir itself", () => {
  for (const section of ["private", "shared"] as const) {
    for (const real of ["", "a.omd", "Roadmap/Q3.omd", "src/main.ts", "x y/z (2).omd"]) {
      const virtual = virtualRelOf(section, real);
      assert.equal(realRelOf(virtual), real, virtual);
      assert.equal(sectionOfRel(virtual), section, virtual);
    }
  }
});

test("a page literally called Private or Shared at a root does not collide with the section dir", () => {
  // Real root page "Private" -> Private.omd + dir Private/. Display: Private/Private.omd.
  assert.equal(virtualRelOf("private", "Private.omd"), "Private/Private.omd");
  assert.equal(realRelOf("Private/Private.omd"), "Private.omd");
  assert.equal(realRelOf("Private/Private"), "Private");
  assert.equal(realRelOf("Shared/Private/Shared.omd"), "Private/Shared.omd");
  assert.equal(sectionOfRel("Shared/Private/Shared.omd"), "shared");
  assert.equal(realRelOf(virtualRelOf("shared", "Private")), "Private");
});

test("section names match case-insensitively (the provider declares insensitive-preserving), slashes are tolerated", () => {
  assert.equal(sectionNamed("private"), "private");
  assert.equal(sectionNamed("SHARED"), "shared");
  assert.equal(sectionNamed("Privately"), null);
  assert.equal(realRelOf("/private//a.omd/"), "a.omd");
  assert.equal(realRelOf("private"), "");
});

test("a rel outside any section (a raw sandbox path) is not a section path and passes through", () => {
  assert.equal(sectionOfRel("src/main.ts"), null);
  assert.equal(realRelOf("src/main.ts"), "src/main.ts");
  assert.equal(sectionOfRel(""), null);
  assert.equal(realRelOf(""), "");
});
