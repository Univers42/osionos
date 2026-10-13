/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-facade.bench.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#+    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { canEditPage, canReadPage, type PageAccessContext } from "../../src/shared/lib/auth/pageAccess.ts";
import { createFixtureStore, page, type FixtureStore } from "../canvas/page-file-facade-fixtures.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench } from "./harness.ts";

const ACCESS: PageAccessContext = { userId: "u1", workspaceIds: ["ws"], privateWorkspaceIds: ["ws"], sharedWorkspaceIds: [] };

const paragraphs = (label: string, count: number): Block[] =>
  Array.from({ length: count }, (_, i) => ({ id: `b${i}`, type: "paragraph", content: `${label} block ${i} with some content to make it realistic.` }));

/** The seeded tree with the data the facade really sees: block pages carry a body, ~1 page in
 *  10 belongs to someone else (private, so the real ACL hides it), ~1 in 7 is shared. */
function realisticTree(count: number): PageEntry[] {
  return generatedTree(count).map((entry, i) => ({
    ...entry,
    updatedAt: "2026-10-13T00:00:00Z",
    ...(entry.surface === "page" ? { content: paragraphs(entry._id, 3) } : { content: [] }),
    ...(i % 10 === 3 ? { ownerId: "u2", visibility: "private" as const } : i % 7 === 0 ? { ownerId: "u2", visibility: "shared" as const } : {}),
  }));
}

/** A fixture store whose ACL is the REAL canReadPage/canEditPage under ACCESS. */
function aclStore(pages: PageEntry[]): FixtureStore {
  const store = createFixtureStore("ws");
  store.canRead = (entry) => canReadPage(entry, ACCESS);
  store.canEdit = (entry) => canEditPage(entry, ACCESS);
  store._seed(pages);
  return store;
}

/** The names from the root down to the deepest directory the facade lists. */
function deepestPath(facade: ReturnType<typeof createPageFileFacade>): string[] {
  const dirs = facade.list().filter((e) => e.kind === "dir");
  const byId = new Map(dirs.map((d) => [d.id, d]));
  let best: string[] = [];
  for (const dir of dirs) {
    const path: string[] = [];
    for (let cur: typeof dir | undefined = dir; cur; cur = cur.parentId === null ? undefined : byId.get(cur.parentId)) path.unshift(cur.name ?? cur.title);
    if (path.length > best.length) best = path;
  }
  return best;
}

/** A folder with exactly 50 code children, appended to the tree. */
function withWideDir(pages: PageEntry[]): PageEntry[] {
  const wide = [page("wide", "wide", null, "folder")];
  for (let i = 0; i < 50; i++) wide.push(page(`wf${i}`, `f${String(i).padStart(2, "0")}`, "wide", "code"));
  return [...pages, ...wide];
}

// 2026-10-13 (docker playground, ide-gate.sh <wt> bench tests/bench/page-file-facade.bench.ts), budget = ~3x p95:
//   deepest path   p95 743 ns    -> 2.5 us      50-child dir  p95 268 ns   -> 1 us
//   list root      p95 9-17 us   -> 50 us       cached read   p95 22 ns    -> 100 ns
//   body edit      p95 212 us    -> 650 us (O(n) real-ACL filter + index shape scan at 10k pages)
export const bench = defineBench("page-file-facade", [
  {
    name: "resolve the deepest dir path, 10k pages",
    budgetNs: 2_500,
    setup: () => {
      const facade = createPageFileFacade(aclStore(realisticTree(10_000)));
      const path = deepestPath(facade);
      if (path.length < 4) throw new Error(`the seeded tree has no deep dir path (${path.length})`);
      return () => {
        let parentId: string | null = null;
        for (const segment of path) {
          const child: ReturnType<NonNullable<ReturnType<typeof createPageFileFacade>["childByName"]>> = facade.childByName?.(parentId, segment);
          if (!child) return null;
          parentId = child.id;
        }
        return parentId;
      };
    },
  },
  {
    name: "list a 50-child dir, 10k pages",
    budgetNs: 1_000,
    setup: () => {
      const facade = createPageFileFacade(aclStore(withWideDir(realisticTree(10_000))));
      return () => facade.children?.("wide");
    },
  },
  {
    name: "list root, 10k pages",
    budgetNs: 50_000,
    setup: () => {
      const facade = createPageFileFacade(aclStore(realisticTree(10_000)));
      return () => facade.children?.(null);
    },
  },
  {
    name: "readContent cached (40-block page)",
    budgetNs: 100,
    setup: () => {
      const store = aclStore([{ ...page("page1", "BigPage.omd", null), content: paragraphs("page1", 40) }]);
      const facade = createPageFileFacade(store);
      void facade.readContent("page1");
      return () => facade.readContent("page1");
    },
  },
  {
    // The two arrays differ ONLY in one block page's body, like two keystrokes in one store, and each iteration hands out a fresh access snapshot so the
    // slice cache cannot answer from a previous round:
    // the readable filter and the index shape scan rerun (O(n) with the real ACL), the tables
    // are reused (the setup refuses to run if they are not).
    name: "facade after a body edit, 10k pages",
    budgetNs: 650_000,
    setup: () => {
      const base = realisticTree(10_000);
      const at = base.findIndex((entry) => entry.surface === "page" && entry.archivedAt === null && entry.ownerId === undefined);
      const withBody = (label: string): PageEntry[] => base.map((entry, i) => (i === at ? { ...entry, content: paragraphs(label, 3) } : entry));
      const [a, b] = [withBody("A"), withBody("B")];
      const store = aclStore(a);
      const facade = createPageFileFacade(store);
      const first = facade.children?.(null)[0];
      store._seed(b);
      if (facade.children?.(null)[0] !== first) throw new Error("a body edit rebuilt the tables: the case would measure the wrong thing");
      let toggle = false;
      return () => {
        toggle = !toggle;
        store._seed(toggle ? a : b);
        store.replaceAccess(); // a real keystroke yields an array this slice cache has never seen
        return facade.children?.(null);
      };
    },
  },
]);
