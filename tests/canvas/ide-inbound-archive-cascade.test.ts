/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-archive-cascade.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `rm -rf` deletes bottom-up, so each page under the folder came due first and was archived
// alone: ~840 PATCHes at ~21/s held the serial queue for 40 s, and a file made in the shell
// right after waited 9.9 s to become a page (C5 run 4, 2026-10-14). A page whose ancestor's
// own delete is pending now waits for that archive, which cascades in one request.
import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import type { StatResult } from "../../src/features/ide/model/inboundArchive.ts";
import { statInProvider } from "../../src/features/ide/model/inboundArchive.ts";
import { blockPage, codePage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

const CHILDREN = 50;
const live = (page: PageEntry | undefined): boolean => page !== undefined && !page.archivedAt;

/** src/ holding CHILDREN code files (and A.omd), all in the sandbox and agreed on. */
async function srcTree(forced = new Map<string, StatResult>()) {
  const pages = [folderPage("F", "src"), blockPage("a", "A", "F")];
  for (let i = 0; i < CHILDREN; i += 1) pages.push(codePage(`m${i}`, `f${i}.c`, `int v${i};\n`, "F"));
  const w: Awaited<ReturnType<typeof execWorld>> = await execWorld(pages, {
    stat: async (path) => forced.get(path) ?? statInProvider(w.sandbox, w.workspaceId, path),
  });
  const texts = new Map<string, string>();
  for (const entry of pages) {
    const state = w.session.view.pageState(entry._id);
    if (state?.status !== "live") continue;
    const text = await w.session.facade.readContent(entry._id);
    texts.set(entry._id, text);
    await putFile(w.sandbox, w.workspaceId, state.filePath, text);
    recordSyncedHash(w.workspaceId, state.filePath, await sha16(text));
  }
  const archived: string[] = [];
  const archive = w.store.archivePage;
  w.store.archivePage = async (id, ...rest) => { archived.push(id); await archive(id, ...rest); };
  return { w, archived, textOf: (id: string) => texts.get(id) ?? "" };
}

/** The order `rm -rf src` reports: every file, then the directory. */
async function rmRf(w: Awaited<ReturnType<typeof execWorld>>): Promise<void> {
  await w.shellDelete("src/A.omd");
  for (let i = 0; i < CHILDREN; i += 1) await w.shellDelete(`src/f${i}.c`);
  await w.shellDelete("src/_folder.omd");
  await w.shellDelete("src");
}

test("rm -rf src: one archive for the folder cascades onto every page under it", async () => {
  const { w, archived } = await srcTree();
  await rmRf(w);
  await w.elapse(); // the pages come due, wait, and the folder's archive cascades
  assert.deepEqual(archived, ["F"]);
  assert.ok(w.store.pages().every((entry) => !live(entry)), "every page under src is in the trash");
  // A ticket left on a trashed page would be due later, and inboundStatBatch asks for every due path.
  assert.equal(w.store.pages().filter((entry) => w.session.view.hasOwnPending(entry._id)).length, 0, "no ticket waits on a trashed page");
  await w.elapse();
  assert.deepEqual(archived, ["F"]);
});

test("a kept folder sends each waiting page to its own check, one window later", async () => {
  const forced = new Map<string, StatResult>([["src", "unknown"]]);
  const { w, archived } = await srcTree(forced);
  await rmRf(w);
  await w.elapse();
  assert.deepEqual(archived, [], "the pages wait for the folder");
  await w.elapse();
  assert.ok(live(w.pageOf("F")), "the folder could not be confirmed gone");
  assert.equal(archived.length, CHILDREN + 1, "each page under it archived alone");
  assert.ok(!archived.includes("F"));
});

test("a page the cascade archived comes back from the shell as itself, not a copy", async () => {
  const { w, textOf } = await srcTree();
  await rmRf(w);
  await w.elapse();
  await w.elapse();
  const count = w.store.pages().length;
  await w.shellWrite("src/A.omd", textOf("a"));
  assert.ok(live(w.pageOf("a")), "restored from the trash");
  assert.equal(w.store.pages().length, count, "no copy");
});
