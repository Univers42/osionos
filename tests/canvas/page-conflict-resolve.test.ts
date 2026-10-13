/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-conflict-resolve.test.ts                      :+:      :+:    :+:   */
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
import type { IdeSyncConflict } from "../../src/features/ide/model/ideSyncConflicts.ts";
import type { PageConflictDeps } from "../../src/features/page-file/model/pageConflictResolve.ts";
import { keepMine, takeFile } from "../../src/features/page-file/model/pageConflictResolve.ts";
import { pageFileText } from "../../src/features/page-file/model/pageFileText.ts";

const PAGE_ID = "p1";
const PAGE: PageEntry = {
  _id: PAGE_ID, title: "Roadmap", workspaceId: "ws", surface: "page",
  parentPageId: null, archivedAt: null, content: [{ id: "b1", type: "paragraph", content: "mine" }],
};
const conflict = (over: Partial<IdeSyncConflict> = {}): IdeSyncConflict => ({
  relPath: "Roadmap.omd", pageId: PAGE_ID, theirs: "theirs text", theirsHash: "H:theirs", atMs: 1, ...over,
});

interface Setup {
  deps: PageConflictDeps;
  /** One entry per collaborator call, in call order. */
  log: string[];
  fsWrites: { path: string; text: string }[];
  contentTexts: string[];
  hashCalls: { path: string; hash: string }[];
  resolvedIds: string[];
  /** What the page still sees now, the way the store would answer a fresh read. */
  live: () => IdeSyncConflict | undefined;
  /** A newer report landed between render and click. */
  report: (next: IdeSyncConflict) => void;
}
interface Options {
  page?: PageEntry; path?: string; conflict?: IdeSyncConflict;
  canEdit?: boolean; acceptsWrite?: boolean; writeContentError?: Error;
}
/** Fakes for every collaborator plus a call log, so a test states what it expects happened and
 *  in which order. `"page" in options` (not `??`) is what lets a test ask for a missing page or
 *  a page with no file. */
function setup(options: Options = {}): Setup {
  const page: PageEntry | undefined = "page" in options ? options.page : PAGE;
  const path: string | undefined = "path" in options ? options.path : "Roadmap.omd";
  const log: string[] = [];
  const fsWrites: { path: string; text: string }[] = [];
  const contentTexts: string[] = [];
  const hashCalls: { path: string; hash: string }[] = [];
  const resolvedIds: string[] = [];
  let current = options.conflict;
  return {
    log, fsWrites, contentTexts, hashCalls, resolvedIds,
    live: () => current,
    report: (next: IdeSyncConflict) => { current = next; },
    deps: {
      pageById: (id) => (page !== undefined && page._id === id ? page : undefined),
      currentPathOf: () => path,
      conflictOf: () => { log.push("read"); return current; },
      canEdit: () => options.canEdit !== false,
      fsWrite: async (_ws, target, text) => {
        log.push(`fs:${target}`);
        fsWrites.push({ path: target, text });
        return options.acceptsWrite !== false;
      },
      writeContent: async (_ws, id, text) => {
        log.push(`content:${id}`);
        if (options.writeContentError) throw options.writeContentError;
        contentTexts.push(text);
      },
      recordSyncedHash: (_ws, target, hash) => {
        log.push(`hash:${target}`);
        hashCalls.push({ path: target, hash });
      },
      resolve: (id) => { log.push(`resolve:${id}`); resolvedIds.push(id); current = undefined; },
    },
  };
}

test("keepMine writes the page's own text at the current path, then resolves", async () => {
  const s = setup({ conflict: conflict() });
  assert.deepEqual(await keepMine(PAGE_ID, s.deps), { ok: true });
  assert.deepEqual(s.fsWrites, [{ path: "Roadmap.omd", text: pageFileText(PAGE) }]);
  assert.deepEqual(s.resolvedIds, [PAGE_ID]);
  assert.equal(s.live(), undefined);
});
test("keepMine after a rename writes the new path and never the stale one", async () => {
  const s = setup({ conflict: conflict({ relPath: "A.omd" }), path: "B.omd" });
  assert.deepEqual(await keepMine(PAGE_ID, s.deps), { ok: true });
  assert.deepEqual(s.fsWrites.map((w) => w.path), ["B.omd"]);
  assert.equal(s.fsWrites.some((w) => w.path === "A.omd"), false);
});
test("keepMine on a folder writes the directory's _folder.omd with no body loaded", async () => {
  const folder = { ...PAGE, surface: "folder" as const, content: undefined };
  const s = setup({ page: folder, path: "Roadmap/_folder.omd", conflict: conflict() });
  assert.deepEqual(await keepMine(PAGE_ID, s.deps), { ok: true });
  assert.deepEqual(s.fsWrites, [{ path: "Roadmap/_folder.omd", text: pageFileText(folder) }]);
  assert.equal(s.live(), undefined);
});
test("keepMine with an unloaded body writes nothing and keeps the conflict", async () => {
  const s = setup({ page: { ...PAGE, content: undefined }, conflict: conflict() });
  assert.deepEqual(await keepMine(PAGE_ID, s.deps), { ok: false, reason: "this page body has not loaded yet" });
  assert.deepEqual(s.fsWrites, []);
  assert.notEqual(s.live(), undefined);
});
test("keepMine when the sandbox refuses the write keeps the conflict", async () => {
  const s = setup({ conflict: conflict(), acceptsWrite: false });
  assert.deepEqual(await keepMine(PAGE_ID, s.deps), { ok: false, reason: "the sandbox did not accept the write" });
  assert.deepEqual(s.resolvedIds, []);
  assert.notEqual(s.live(), undefined);
});
test("keepMine never records a synced hash (ideFsWrite owns that bookkeeping)", async () => {
  const s = setup({ conflict: conflict() });
  await keepMine(PAGE_ID, s.deps);
  const moved = setup({ conflict: conflict({ relPath: "A.omd" }), path: "B.omd" });
  await keepMine(PAGE_ID, moved.deps);
  assert.deepEqual([s.hashCalls, moved.hashCalls], [[], []]);
});
test("takeFile writes theirs, records theirsHash at the current path, then resolves", async () => {
  const s = setup({ conflict: conflict({ relPath: "A.omd" }), path: "B.omd" });
  assert.deepEqual(await takeFile(PAGE_ID, s.deps), { ok: true });
  assert.deepEqual(s.log, ["read", "content:p1", "hash:B.omd", "resolve:p1"]);
  assert.deepEqual(s.contentTexts, ["theirs text"]);
  assert.deepEqual(s.hashCalls, [{ path: "B.omd", hash: "H:theirs" }]);
  assert.equal(s.live(), undefined);
});
test("takeFile when writeContent throws records nothing and keeps the conflict", async () => {
  const s = setup({ conflict: conflict(), writeContentError: new Error("Io: not a live writable page") });
  assert.deepEqual(await takeFile(PAGE_ID, s.deps), { ok: false, reason: "Io: not a live writable page" });
  assert.deepEqual(s.hashCalls, []);
  assert.deepEqual(s.resolvedIds, []);
  assert.notEqual(s.live(), undefined);
});
test("takeFile on a read-only page writes nothing at all", async () => {
  const s = setup({ conflict: conflict(), canEdit: false });
  assert.deepEqual(await takeFile(PAGE_ID, s.deps), { ok: false, reason: "you can't edit this page" });
  assert.deepEqual(s.contentTexts, []);
  assert.deepEqual(s.hashCalls, []);
  assert.notEqual(s.live(), undefined);
});
test("a page with no file any more drops the conflict and reports the failure", async () => {
  const s = setup({ page: { ...PAGE, archivedAt: "2026-10-13" }, path: undefined, conflict: conflict() });
  const t = setup({ page: { ...PAGE, archivedAt: "2026-10-13" }, path: undefined, conflict: conflict() });
  const kept = await keepMine(PAGE_ID, s.deps);
  const took = await takeFile(PAGE_ID, t.deps);
  assert.deepEqual(kept, { ok: false, reason: "this page has no file any more" });
  assert.deepEqual(took, { ok: false, reason: "this page has no file any more" });
  assert.deepEqual([s.resolvedIds, t.resolvedIds], [[PAGE_ID], [PAGE_ID]]);
  assert.equal(s.live(), undefined);
  assert.deepEqual(s.fsWrites, []);
});
test("a missing page drops the conflict and reports the failure", async () => {
  const s = setup({ page: undefined, conflict: conflict() });
  const t = setup({ page: undefined, conflict: conflict() });
  const kept = await keepMine(PAGE_ID, s.deps);
  const took = await takeFile(PAGE_ID, t.deps);
  assert.deepEqual(kept, { ok: false, reason: "this page no longer exists" });
  assert.deepEqual(took, { ok: false, reason: "this page no longer exists" });
  assert.deepEqual([s.resolvedIds, t.resolvedIds], [[PAGE_ID], [PAGE_ID]]);
  assert.deepEqual(s.fsWrites, []);
});
test("a conflict replaced between render and click resolves the newer one", async () => {
  const s = setup({ conflict: conflict({ theirs: "old", theirsHash: "H:old" }) });
  s.report(conflict({ theirs: "new", theirsHash: "H:new", atMs: 2 }));
  assert.deepEqual(await takeFile(PAGE_ID, s.deps), { ok: true });
  assert.deepEqual(s.contentTexts, ["new"]);
  assert.deepEqual(s.hashCalls, [{ path: "Roadmap.omd", hash: "H:new" }]);
});
test("no conflict left to act on reports it as already resolved", async () => {
  const s = setup();
  assert.deepEqual(await keepMine(PAGE_ID, s.deps), { ok: false, reason: "this conflict was already resolved" });
  assert.deepEqual(await takeFile(PAGE_ID, s.deps), { ok: false, reason: "this conflict was already resolved" });
  assert.deepEqual(s.fsWrites, []);
});
test("neither action throws when every collaborator throws", async () => {
  const boom = (): never => { throw new Error("collaborator down"); };
  const deps: PageConflictDeps = {
    pageById: () => boom(), currentPathOf: () => boom(), conflictOf: () => boom(), canEdit: () => boom(),
    fsWrite: async () => boom(), writeContent: async () => boom(),
    recordSyncedHash: () => boom(), resolve: () => boom(),
  };
  assert.deepEqual(await keepMine(PAGE_ID, deps), { ok: false, reason: "collaborator down" });
  assert.deepEqual(await takeFile(PAGE_ID, deps), { ok: false, reason: "collaborator down" });
});
