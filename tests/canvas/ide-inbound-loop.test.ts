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
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { b64, blockPage, execWorld, putFile } from "./fixtures/inboundWorld.ts";
import { snapshotOf, writerRound } from "./fixtures/outboundWorld.ts";

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
