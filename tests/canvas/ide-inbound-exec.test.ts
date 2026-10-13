/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-exec.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inbound executor over a real page-file facade: one shell write or delete
// in, the page tree, ledger, conflict store and Output feed checked after.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { unloadedPage } from "./page-file-facade-fixtures.ts";
import { b64, blockPage, execWorld, folderPage } from "./fixtures/inboundWorld.ts";

const said = (fragment: string): boolean => useIdeOutputBus.getState().lines.some((line) => line.text.includes(fragment));
const bodyOf = (text: string): string => text.slice(text.lastIndexOf("---\n") + 4);
const withBody = (text: string, body: string): string => text.slice(0, text.length - bodyOf(text).length) + body;

/** A world where Roadmap's file is already agreed on: the ledger holds its current text. */
async function syncedRoadmap() {
  const world = await execWorld([blockPage("R", "Roadmap")]);
  const ours = await world.session.facade.readContent("R");
  recordSyncedHash(world.workspaceId, "Roadmap.omd", await sha16(ours));
  return { ...world, ours };
}

test("R5 apply: a shell edit of Roadmap.omd reaches the page through writeContent and records the event hash", async () => {
  const world = await syncedRoadmap();
  const theirs = withBody(world.ours, "Edited in vim\n");
  await world.shellWrite("Roadmap.omd", theirs);
  assert.equal(world.pageOf("R")?.content?.[0]?.content, "Edited in vim");
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(theirs));
});

test("B6: an inbound .omd from a non-owner changes neither title, surface nor visibility (the body still applies)", async () => {
  const world = await syncedRoadmap();
  world.store.canChangeSharing = () => false;
  await world.shellWrite("Roadmap.omd", '---\nid: "R"\ntitle: "Hacked"\nsurface: "folder"\nvisibility: "public"\n---\nNew body\n');
  const page = world.pageOf("R");
  assert.equal(page?.title, "Roadmap");
  assert.equal(page?.surface, "page");
  assert.equal(page?.visibility, undefined);
  assert.equal(page?.content?.[0]?.content, "New body");
});

test("14: a page created from a shell file keeps its hand-written front matter (icon, cover, properties); the name owns the title", async () => {
  const world = await execWorld([]);
  const text = '---\ntitle: "Other"\nicon: "R"\ncover: "https://example.test/c.png"\nproperties: [{"key":"k","label":"K","value":"v"}]\n---\nHello\n';
  await world.shellWrite("Fresh.omd", text);
  const created = world.store.pages().find((entry) => entry.title === "Fresh");
  assert.ok(created, "the page exists under the file's name");
  assert.equal(created.icon, "R");
  assert.equal(created.cover, "https://example.test/c.png");
  assert.deepEqual(created.properties, [{ key: "k", label: "K", value: "v" }]);
  assert.equal(created.content?.[0]?.content, "Hello");
  assert.equal(syncedHashOf(world.workspaceId, "Fresh.omd"), await sha16(text), "recorded, so the writer may add the id");
});

test("17: mkdir Roadmap; vim Roadmap/Child.omd creates Child under the existing page Roadmap, not a folder", async () => {
  const world = await execWorld([blockPage("R", "Roadmap")]);
  await world.shellWrite("Roadmap/Child.omd", "child body\n");
  const child = world.store.pages().find((entry) => entry.title === "Child");
  assert.equal(child?.parentPageId, "R");
  assert.equal(world.store.pages().filter((entry) => entry.surface === "folder").length, 0, "no folder page was made");
  assert.equal(world.session.view.pageState(child?._id ?? "")?.status, "live");
});

test("17: a create under directories no page owns creates the missing folders, outermost first", async () => {
  const world = await execWorld([]);
  await world.shellWrite("docs/api/Intro.omd", "intro\n");
  const byTitle = (title: string) => world.store.pages().find((entry) => entry.title === title);
  assert.equal(byTitle("docs")?.surface, "folder");
  assert.equal(byTitle("api")?.parentPageId, byTitle("docs")?._id);
  assert.equal(byTitle("Intro")?.parentPageId, byTitle("api")?._id);
  assert.deepEqual(world.session.view.pageState(byTitle("Intro")?._id ?? ""), {
    status: "live", path: "docs/api/Intro.omd", filePath: "docs/api/Intro.omd", isFolder: false, parentId: byTitle("api")?._id,
  });
});

test("20: invalid UTF-8 is one loud skip; nothing applied, nothing recorded", async () => {
  const world = await execWorld([]);
  useIdeOutputBus.getState().clear();
  await world.send({ event: "write", path: "Bin.omd", hash: "h-bin", content: btoa(String.fromCharCode(0xff, 0xfe, 0x00)) });
  await world.send({ event: "write", path: "Bad.omd", hash: "h-bad", content: "%%% not base64" });
  assert.ok(said("Bin.omd: not synced — not UTF-8 text"));
  assert.ok(said("Bad.omd: not synced — not UTF-8 text"));
  assert.equal(world.store.pages().length, 0);
  assert.equal(syncedHashOf(world.workspaceId, "Bin.omd"), null);
});

test("23: a conflict on a folder's _folder.omd is reported under the folder's id with the file path", async () => {
  const world = await execWorld([folderPage("F", "src")]);
  useIdeSyncConflicts.getState().clearWorkspace();
  recordSyncedHash(world.workspaceId, "src/_folder.omd", "an-older-agreement");
  const theirs = '---\nid: "F"\nicon: "x"\n---\n';
  await world.shellWrite("src/_folder.omd", theirs);
  const conflict = useIdeSyncConflicts.getState().byPageId.F;
  assert.equal(conflict?.relPath, "src/_folder.omd");
  assert.equal(conflict?.theirs, theirs);
  assert.equal(conflict?.theirsHash, await sha16(theirs));
  assert.equal(syncedHashOf(world.workspaceId, "src/_folder.omd"), "an-older-agreement", "a conflict records nothing");
});

test("24: a refused step is reported and skips its event; the next event still runs; the handler never throws", async () => {
  const world = await syncedRoadmap();
  useIdeOutputBus.getState().clear();
  world.store.canEdit = (entry) => entry._id !== "R";
  await world.shellWrite("Roadmap.omd", withBody(world.ours, "refused\n"));
  assert.ok(said("Roadmap.omd: not applied"));
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(world.ours), "the ledger keeps the old agreement");
  await world.send({ event: "write", path: "a/../b.omd", hash: "h", content: b64("x") });
  await world.send({ event: "rename", path: "x" });
  await world.shellWrite("Next.omd", "next\n");
  assert.ok(world.store.pages().some((entry) => entry.title === "Next"));
  assert.deepEqual(world.queueErrors, [], "nothing escaped to the queue");
});

test("24: a view that throws while planning (a body fetch fails) is reported, never thrown", async () => {
  const world = await execWorld([unloadedPage("U", "Lazy", null)]);
  useIdeOutputBus.getState().clear();
  world.store.loadContent = async () => { throw new Error("offline"); };
  await world.shellWrite("Lazy.omd", "x\n");
  assert.ok(said("Lazy.omd: event skipped — offline"));
  assert.deepEqual(world.queueErrors, []);
});
