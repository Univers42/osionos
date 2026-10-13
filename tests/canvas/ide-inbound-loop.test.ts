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
import { bytesToText, collectBytes } from "../../src/features/ide/vfs/bytes.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { planOutbound, type Snapshot } from "../../src/features/page-file/model/outboundPlan.ts";
import { runOutbound, type OutboundIo } from "../../src/features/page-file/model/outboundRun.ts";
import { pageIndexFor } from "../../src/features/page-file/model/pageIndexCache.ts";
import { b64, blockPage, execWorld, putFile } from "./fixtures/inboundWorld.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

const snapshotOf = (world: World): Snapshot => {
  const pages = world.store.pages();
  return { index: pageIndexFor(world.workspaceId, pages), pages };
};

/** The writer's io over the world's sandbox, every write logged. */
function sandboxIo(world: World, writes: string[]): OutboundIo {
  const at = (path: string) => buildVPath("sandbox", world.workspaceId, path.split("/"));
  return {
    read: async (path) => world.sandbox.read(at(path)).then(async (data) => bytesToText(await collectBytes(data)), () => null),
    write: async (path, content) => { writes.push(path); await putFile(world.sandbox, world.workspaceId, path, content); },
    rename: async (from, to) => world.sandbox.rename(at(from), at(to)),
    remove: async (path) => world.sandbox.delete(at(path)),
  };
}

async function writerRound(world: World, from: Snapshot, writes: string[]): Promise<Snapshot> {
  const next = snapshotOf(world);
  const byId = new Map(next.pages.map((entry) => [entry._id, entry]));
  await runOutbound({
    workspaceId: world.workspaceId, plan: planOutbound(from, next), io: sandboxIo(world, writes),
    pageById: (id) => byId.get(id), pathOf: (id) => next.index.pathForId(id),
  });
  return next;
}

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
