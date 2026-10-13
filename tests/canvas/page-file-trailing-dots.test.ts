/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-trailing-dots.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Q1: a page title ending in dots. The writer must not name its file "etc..omd"
// (a name the inbound guard refuses), and the file it does write must sync back.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import { assignSiblingNames } from "../../src/features/page-file/model/pagePaths.ts";
import { blockPage, codePage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";

test("Q1 out: a page titled \"etc.\" is written etc.omd with its children in etc/", () => {
  assert.deepEqual(assignSiblingNames([blockPage("E", "etc.")]).get("E"), { own: "etc.omd", childDir: "etc" });
  assert.deepEqual(assignSiblingNames([blockPage("E", "v1.2..")]).get("E"), { own: "v1.2.omd", childDir: "v1.2" });
});

test("Q1 out: only pages lose the dots — a folder or code page named \"etc.\" keeps its name", () => {
  const names = assignSiblingNames([folderPage("F", "etc."), codePage("C", "run.", "echo hi")]);
  assert.equal(names.get("F")?.own, "etc.");
  assert.equal(names.get("C")?.own, "run.");
});

test("Q1 out: \"etc\" and \"etc.\" side by side keep the (2) collision rule", () => {
  const names = assignSiblingNames([blockPage("A", "etc"), blockPage("B", "etc.")]);
  assert.equal(names.get("A")?.own, "etc.omd");
  assert.equal(names.get("B")?.own, "etc (2).omd");
});

test("Q1 in: a shell edit of etc.omd reaches the page titled \"etc.\" (it was refused as etc..omd)", async () => {
  const world = await execWorld([blockPage("E", "etc.")]);
  const ours = await world.session.facade.readContent("E");
  await putFile(world.sandbox, world.workspaceId, "etc.omd", ours);
  recordSyncedHash(world.workspaceId, "etc.omd", await sha16(ours));
  await world.shellWrite("etc.omd", `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}Edited in vim\n`);
  assert.equal(world.store.pages().length, 1, "no second page");
  assert.equal(world.pageOf("E")?.title, "etc.");
  assert.match(JSON.stringify(world.pageOf("E")?.content), /Edited in vim/);
});
