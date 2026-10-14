/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-loop.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Condition 21: a shell edit travels in, the writer sends the page back out once
// (its `updated` line moved), the fs-agent's echo of that write changes nothing,
// and the next writer round has nothing to write — no ping-pong.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { statInProvider, type StatResult } from "../../src/features/ide/model/inboundArchive.ts";
import { INBOUND_WINDOW_MS } from "../../src/features/ide/model/inboundPending.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { b64, blockPage, codePage, execWorld, putFile } from "./fixtures/inboundWorld.ts";
import { snapshotOf, writerRound } from "./fixtures/outboundWorld.ts";

import type { PageEntry } from "../../src/entities/page/model/types.ts";

test("21 loop: one shell edit → one apply → exactly one outbound write; its echo records only; a second round writes nothing", async () => {
  const world = await execWorld([{ ...blockPage("R", "Roadmap"), updatedAt: "2026-01-01T00:00:00.000Z" }]);
  const ours = await world.session.facade.readContent("R");
  await putFile(world.sandbox, world.workspaceId, "Roadmap.omd", ours);
  recordSyncedHash(world.workspaceId, "Roadmap.omd", await sha16(ours));
  const flushed = snapshotOf(world);

  const theirs = `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}Edited in vim\n`;
  await world.shellWrite("Roadmap.omd", theirs);
  const writes: string[] = [];
  const afterApply = await writerRound(world, flushed, writes);
  assert.deepEqual(writes, ["Roadmap.omd"], "the apply moved `updated`, so the page goes back out exactly once");
  const written = await world.session.facade.readContent("R");
  assert.notEqual(written, theirs);

  const pageBeforeEcho = world.pageOf("R");
  await world.send({ event: "write", path: "Roadmap.omd", hash: await sha16(written), content: b64(written) });
  assert.equal(world.pageOf("R"), pageBeforeEcho, "the echo must not touch the page");
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(written));

  await writerRound(world, afterApply, writes);
  assert.deepEqual(writes, ["Roadmap.omd"], "a second round has nothing to write");
});

// Live VM, 2026-10-14: `rm -rf ft_printf_42 && git clone …` lost 231 cloned files.
// Each delete archived the file's page, each cloned file came back as a new page at
// the same path with the same bytes, and the next writer round removed the old
// pages' files — which were the new pages' files.
test("rm -rf then clone again: the archived page's path holds a new page, the writer keeps its file", async () => {
  const source = "int\tmain(void)\n{\n\treturn (0);\n}\n";
  const world = await execWorld([]);
  await world.shellWrite("main.c", source);
  const flushed = await writerRound(world, snapshotOf(world), []);
  const before = flushed.index.idForPath("main.c");
  assert.ok(before, "the shell create made a page");

  await world.shellDelete("main.c");
  await world.elapse();
  assert.ok(world.pageOf(before)?.archivedAt, "the delete archived the page");
  await world.shellWrite("main.c", source);

  const after = await writerRound(world, flushed, []);
  assert.notEqual(after.index.idForPath("main.c"), before, "the clone made a new page");
  const kept = await world.sandbox.read(buildVPath("sandbox", world.workspaceId, ["main.c"])).then(() => true, () => false);
  assert.equal(kept, true, "the cloned file is still in the sandbox");
});

const cSource = "int\tmain(void)\n{\n\treturn (0);\n}\n";
type World = Awaited<ReturnType<typeof execWorld>>;
const inSandbox = (world: World, path: string): Promise<boolean> =>
  world.sandbox.read(buildVPath("sandbox", world.workspaceId, path.split("/"))).then(() => true, () => false);

/**
 * The tree a re-clone starts from: `pages` agreed on with their files, `files` made in the
 * shell, then one writer round as the baseline. A path in `forced` answers the archive
 * check with that result instead of the sandbox's (a 429 or a 5xx past its retries is
 * "unknown"; a batched answer up to 2 s old can be a stale "absent").
 */
async function clonedTree(pages: PageEntry[], files: readonly string[]) {
  const forced = new Map<string, StatResult>();
  const world: World = await execWorld(pages, {
    stat: async (path) => forced.get(path) ?? statInProvider(world.sandbox, world.workspaceId, path),
  });
  const texts = new Map<string, string>();
  for (const entry of pages) {
    const state = world.session.view.pageState(entry._id);
    if (state?.status !== "live" || state.isFolder) continue;
    const text = await world.session.facade.readContent(entry._id);
    texts.set(state.filePath, text);
    await putFile(world.sandbox, world.workspaceId, state.filePath, text);
    recordSyncedHash(world.workspaceId, state.filePath, await sha16(text));
  }
  for (const path of files) {
    await world.shellWrite(path, cSource);
    texts.set(path, cSource);
  }
  const flushed = await writerRound(world, snapshotOf(world), []);
  /** `rm -rf`: every path in the order the fs-agent reports it, deepest first. */
  const removeAll = async (paths: readonly string[]): Promise<void> => { for (const path of paths) await world.shellDelete(path); };
  /** `git clone`: the same bytes back at every path; their events still queued. */
  const cloneBack = async (): Promise<void> => { for (const [path, text] of texts) await putFile(world.sandbox, world.workspaceId, path, text); };
  return { world, forced, flushed, removeAll, cloneBack, idAt: (path: string) => flushed.index.idForPath(path) };
}

async function assertAllInSandbox(world: World, paths: readonly string[]): Promise<void> {
  for (const path of paths) assert.equal(await inSandbox(world, path), true, `${path} is still in the sandbox`);
}

// Devil C1 (2026-10-14): a page the archive check kept ("unknown") is archived anyway when
// its folder's check says "absent": the store cascades the folder's archive onto it, and
// its agreement — never cleared, it was not the page archived — matched the clone's bytes.
test("C1: rm -rf with one child unconfirmed; the folder's archive cascades onto it; the clone's file stays", async () => {
  const tree = await clonedTree([], ["proj/main.c"]);
  const child = tree.idAt("proj/main.c");
  tree.forced.set("proj/main.c", "unknown");
  await tree.removeAll(["proj/main.c", "proj"]);
  await tree.world.elapse();
  assert.ok(child && tree.world.pageOf(child)?.archivedAt, "the folder's archive cascaded onto the child");
  await tree.cloneBack();
  await writerRound(tree.world, tree.flushed, []);
  await assertAllInSandbox(tree.world, ["proj/main.c"]);
});

// Devil C2: the clone's write lands inside the window and keeps the child's page; the
// folder's check then reads a stale "absent" and archives the folder onto that child.
test("C2: the clone's write keeps the child, a stale 'absent' archives its folder; the file stays", async () => {
  const tree = await clonedTree([], ["proj/main.c"]);
  const child = tree.idAt("proj/main.c");
  await tree.removeAll(["proj/main.c", "proj"]);
  await putFile(tree.world.sandbox, tree.world.workspaceId, "proj/main.c", cSource);
  await tree.world.send({ event: "write", path: "proj/main.c", hash: await sha16(cSource), content: b64(cSource) });
  tree.forced.set("proj", "absent");
  await tree.world.elapse();
  assert.ok(child && tree.world.pageOf(child)?.archivedAt, "the folder's archive cascaded onto the kept child");
  await writerRound(tree.world, tree.flushed, []);
  await assertAllInSandbox(tree.world, ["proj/main.c"]);
});

test("C1 nested: proj/libft/ and its file unconfirmed, proj archived two levels down; every cloned file stays", async () => {
  const tree = await clonedTree([], ["proj/main.c", "proj/libft/x.c"]);
  tree.forced.set("proj/libft/x.c", "unknown");
  tree.forced.set("proj/libft", "unknown");
  await tree.removeAll(["proj/libft/x.c", "proj/libft", "proj/main.c", "proj"]);
  await tree.world.elapse();
  assert.ok(tree.world.pageOf(tree.idAt("proj/libft/x.c") ?? "")?.archivedAt, "proj's archive reached x.c");
  await tree.cloneBack();
  await writerRound(tree.world, tree.flushed, []);
  await assertAllInSandbox(tree.world, ["proj/main.c", "proj/libft/x.c"]);
});

test("C1 page with children: X.omd and X/ deleted, X/y.c unconfirmed; X's archive cascades; both files stay", async () => {
  const tree = await clonedTree([blockPage("X", "X"), codePage("y", "y.c", cSource, "X")], []);
  tree.forced.set("X/y.c", "unknown");
  await tree.removeAll(["X/y.c", "X", "X.omd"]);
  await tree.world.elapse();
  assert.ok(tree.world.pageOf("y")?.archivedAt, "X's archive cascaded onto y.c");
  await tree.cloneBack();
  await writerRound(tree.world, tree.flushed, []);
  await assertAllInSandbox(tree.world, ["X.omd", "X/y.c"]);
});

// Devil O1: a store whose archive resolves a macrotask after its set() — a writer round in
// that gap must not read an agreement the archive is about to clear.
test("O1: a writer round between the store's set() and the archive resolving keeps the cloned file", async () => {
  const tree = await clonedTree([], ["main.c"]);
  const id = tree.idAt("main.c");
  const archive = tree.world.store.archivePage;
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  tree.world.store.archivePage = async (pageId) => { await archive(pageId); await gate; };
  await tree.world.shellDelete("main.c");
  tree.world.clock.advance(INBOUND_WINDOW_MS);
  for (let turn = 0; turn < 20 && !tree.world.pageOf(id ?? "")?.archivedAt; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(tree.world.pageOf(id ?? "")?.archivedAt, "the store shows the archive");
  await tree.cloneBack();
  await writerRound(tree.world, tree.flushed, []);
  release();
  await tree.world.queue.idle();
  await assertAllInSandbox(tree.world, ["main.c"]);
});
