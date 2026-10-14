/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-stat-batch.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `rm -rf` of 1 300 files put 1 307 sandbox stats, one per archive check, on the
// serial event queue (live VM, 2026-10-14); the batched stat asks for every due
// path at once.

import assert from "node:assert/strict";
import test from "node:test";

import { createBatchedStat } from "../../src/features/ide/model/inboundStatBatch.ts";
import { statInProvider, type StatResult } from "../../src/features/ide/model/inboundArchive.ts";
import { blockPage, codePage, execWorld, folderPage } from "./fixtures/inboundWorld.ts";
import type { StatMany } from "../../src/features/ide/model/inboundStatBatch.ts";

/** A sandbox where every path is absent, counting requests. */
function counting(answer: (path: string) => StatResult | undefined = () => "absent") {
  const calls = { many: [] as number[], single: [] as string[] };
  const statMany: StatMany = async (paths) => {
    calls.many.push(paths.length);
    const results = new Map<string, StatResult>();
    for (const path of paths) { const result = answer(path); if (result !== undefined) results.set(path, result); }
    return results;
  };
  const stat = async (path: string): Promise<StatResult> => { calls.single.push(path); return "unknown"; };
  return { calls, statMany, stat };
}

test("stat batch: 1 000 due archive checks cost two requests, not 1 000", async () => {
  const due = new Set(Array.from({ length: 1000 }, (_, i) => `src/f${i}.c`));
  const sandbox = counting();
  const stat = createBatchedStat({ ...sandbox, duePaths: () => [...due], now: () => 0 });
  for (const path of [...due]) {
    due.delete(path); // claimed before its check, as archiveIfGone does
    assert.equal(await stat(path), "absent");
  }
  assert.deepEqual(sandbox.calls.many, [500, 500]);
  assert.deepEqual(sandbox.calls.single, []);
});

test("stat batch: an answer older than the TTL, or already used, is asked again", async () => {
  let now = 0;
  const sandbox = counting();
  const stat = createBatchedStat({ ...sandbox, duePaths: () => ["a.c", "b.c"], now: () => now, ttlMs: 2000 });
  await stat("x.c");
  now = 2001;
  await stat("a.c");
  assert.equal(sandbox.calls.many.length, 2, "a.c's answer had expired");
  await stat("b.c");
  assert.equal(sandbox.calls.many.length, 2, "b.c came with the second batch");
  await stat("b.c");
  assert.equal(sandbox.calls.many.length, 3, "an answer is used once");
});

test("stat batch: a path the batch leaves out, or a failed batch, is asked alone", async () => {
  const sandbox = counting((path) => (path.includes("..") ? undefined : "present"));
  const stat = createBatchedStat({ ...sandbox, duePaths: () => [], now: () => 0 });
  assert.equal(await stat("a..b.c"), "unknown");
  assert.deepEqual(sandbox.calls.single, ["a..b.c"]);
  const failing = createBatchedStat({ stat: sandbox.stat, statMany: () => Promise.reject(new Error("bridge 429")), duePaths: () => [], now: () => 0 });
  assert.equal(await failing("c.c"), "unknown");
  assert.deepEqual(sandbox.calls.single, ["a..b.c", "c.c"]);
});

test("stat batch, end to end: rm of 600 pages' files archives them all with two sandbox requests", async () => {
  const pages = Array.from({ length: 600 }, (_, i) => blockPage(`P${i}`, `P${i}`));
  const requests: number[] = [];
  let single = 0;
  const world = await execWorld(pages, {
    stat: async () => { single += 1; return "unknown"; },
    statMany: async (paths) => {
      requests.push(paths.length);
      return new Map(await Promise.all(paths.map(async (path) => [path, await statInProvider(world.sandbox, world.workspaceId, path)] as const)));
    },
  });
  for (let i = 0; i < 600; i += 1) await world.shellDelete(`P${i}.omd`);
  await world.elapse();
  assert.equal(pages.filter((page) => world.pageOf(page._id)?.archivedAt).length, 600);
  assert.deepEqual(requests, [500, 100]);
  assert.equal(single, 0);
});

test("stat batch caveat: a code file made again after the batch read it absent gets a page with the new text", async () => {
  const world = await execWorld([folderPage("G", "gnl"), codePage("M", "Makefile", "all:\n\techo old\n", "G"), codePage("C", "main.c", "int main;\n", "G")], {
    statMany: async (paths) => new Map(paths.map((path) => [path, "absent" as const])), // a snapshot taken before Makefile came back
  });
  await world.shellWrite("gnl/Makefile", "all:\n\techo old\n");
  await world.shellWrite("gnl/main.c", "int main;\n");
  await world.shellDelete("gnl/Makefile");
  await world.shellDelete("gnl/main.c");
  await world.elapse(); // both archived: Makefile on the stale "absent"
  await world.shellWrite("gnl/Makefile", "");
  const live = world.store.pages().filter((page) => !page.archivedAt && page.title === "Makefile");
  assert.equal(live.length, 1, "one live Makefile page");
  assert.notEqual(live[0]._id, "M", "a new page; the old one stays in the trash");
  assert.equal(await world.session.facade.readContent(live[0]._id), "", "the file's text, not the old page's");
  assert.ok(world.pageOf("M")?.archivedAt);
});
