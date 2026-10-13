/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileBatchCreate.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Many creates for ONE index build. A lone create (pageFileFacadeOps createPage)
// asks the index right after its add — "did I displace anyone?" — which rebuilds
// the index and tables over the whole workspace: ~20 ms per create at 10 000
// pages (tests/bench/inbound-burst.bench.ts). A batch claims every name against
// the tables as they stood, adds every page, then asks once per directory.

import { addPageFor, type CreateInput } from "./pageFileAddPage";
import { operationContext } from "./pageFileFacade";
import { assertNotFolderMeta, displacesSiblings, reservedNames, type OpContext } from "./pageFileFacadeOps";
import { ownerOf, type Tables } from "./pageFileFacadeTables";
import { assignSiblingNames } from "./pagePaths";

import type { PageEntry } from "@/entities/page";
import type { PageFileStore } from "./pageFileFacade";
import type { ReadableViews } from "./pageFileFacadeViews";

/** One create's outcome, in input order: the page, or why it was refused. */
export type BatchCreateResult = { page: PageEntry } | { error: string };

type Added = { page: PageEntry; parentId: string | null; at: number };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * createPage's refusals, item by item: a folder meta name, a name the tables or an
 * EARLIER item claims (case-insensitively), a store that created nothing, and a
 * page a concurrent writer collided with (archived, as createPage does).
 * O(n + Σ len(content) + Σ s log s over the directories touched).
 */
export async function createPagesBatch(deps: PageFileStore, views: ReadableViews, inputs: readonly CreateInput[]): Promise<BatchCreateResult[]> {
  const ctx = operationContext(deps, views);
  const tables = views.tablesFor();
  const taken = new Map<string | null, Set<string>>();
  const results: BatchCreateResult[] = [];
  const added: Added[] = [];
  for (const [at, input] of inputs.entries()) {
    try {
      const parentId = claim(deps, tables, taken, input);
      const page = await addPageFor(deps, input, parentId);
      if (page === null) throw new Error("page create failed");
      results.push({ page });
      added.push({ page, parentId, at });
    } catch (error) {
      results.push({ error: messageOf(error) });
    }
  }
  for (const loser of await displaced(ctx, added)) {
    await deps.archivePage(loser.page._id);
    results[loser.at] = { error: `AlreadyExists: ${deps.toSegment(inputs[loser.at].title)} was created concurrently by another writer` };
  }
  return results;
}

/** The parent id, once both names the page will hold are free here and in this batch. O(len). */
function claim(deps: PageFileStore, tables: Tables, taken: Map<string | null, Set<string>>, input: CreateInput): string | null {
  assertNotFolderMeta(deps, input.title);
  const parentId = input.parentId === null ? null : ownerOf(input.parentId);
  const wanted = deps.toSegment(input.title);
  const names = reservedNames(input, wanted);
  const claimed = tables.dirs.get(parentId ?? "")?.claimed;
  const mine = taken.get(parentId) ?? new Set<string>();
  if (names.some((name) => claimed?.has(name) || mine.has(name))) {
    throw new Error(`AlreadyExists: ${wanted} already exists here (names compare case-insensitively)`);
  }
  for (const name of names) mine.add(name);
  taken.set(parentId, mine);
  return parentId;
}

/**
 * The batch pages a concurrent writer collided with. One sibling-name pass per
 * directory; only a directory where something moved pays createPage's per-page
 * check. O(n + s log s) per directory.
 */
async function displaced(ctx: OpContext, added: readonly Added[]): Promise<Added[]> {
  const byParent = new Map<string | null, Added[]>();
  for (const entry of added) {
    const group = byParent.get(entry.parentId);
    if (group === undefined) byParent.set(entry.parentId, [entry]);
    else group.push(entry);
  }
  const losers: Added[] = [];
  for (const [parentId, group] of byParent) {
    if (!namesMoved(ctx, parentId, group)) continue;
    losers.push(...group.filter((entry) => displacesSiblings(ctx, entry.page, parentId)));
  }
  return losers;
}

function namesMoved(ctx: OpContext, parentId: string | null, group: readonly Added[]): boolean {
  const mine = new Set(group.map((entry) => entry.page._id));
  const siblings = ctx.deps.pages().filter((page) => (page.parentPageId ?? null) === parentId && ctx.pageById(page._id) !== undefined);
  const before = assignSiblingNames(siblings.filter((page) => !mine.has(page._id)));
  const after = assignSiblingNames(siblings);
  const lone = (page: PageEntry): string | undefined => assignSiblingNames([page]).get(page._id)?.own.toLowerCase();
  return siblings.some((page) => after.get(page._id)?.own.toLowerCase() !== (mine.has(page._id) ? lone(page) : before.get(page._id)?.own.toLowerCase()));
}
