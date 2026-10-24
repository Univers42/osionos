/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profile-field-slash.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P2-2-c: the Profile field slash item. The catalog entry, the README-page gate, what the
// select does (and does not do when the gate is false), and the save path keeping both
// binding keys (reviewer decision 6) through updateBlock/insertBlock and the outbox PATCH.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import { filterSlashCommands, SLASH_COMMANDS } from "@/features/slash-commands/model/slashMenuCatalog";
import { selectProfileField } from "@/features/slash-commands/model/useSlashProfileFieldSelect";
import { isReadmePage } from "@/features/profile-binding/model/readmePage";
import { applyBlockInsert, applyBlockUpdate } from "@/store/pageStore.helpers";
import { publishPage } from "@/store/sync/pageOutbox";
import { clearBase, setBase } from "@/store/sync/pageBase";
import { bridgeDeps, createBridge, pageEntry, para } from "./page-version.fixtures";

const PAGE = "readme-page";
const menu = (blockId: string, anchor = 0) => ({ blockId, filter: "profile", position: { x: 0, y: 0, top: 0 }, anchor });

function run(blocks: Block[], isReadme: boolean) {
  const calls: Array<{ op: "update" | "insert"; blockId: string; payload: Partial<Block> | Block }> = [];
  let closed = 0;
  selectProfileField({
    pageId: PAGE,
    slashMenu: menu(blocks[0].id),
    setSlashMenu: () => { closed += 1; },
    updateBlock: (_page, blockId, payload) => calls.push({ op: "update", blockId, payload }),
    insertBlock: (_page, blockId, payload) => calls.push({ op: "insert", blockId, payload }),
    content: blocks,
    isReadme,
  });
  return { calls, closed };
}

test("the catalog holds one Profile field entry, in advanced, with its aliases", () => {
  const entries = SLASH_COMMANDS.filter((c) => c.kind === "profile-field");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "advanced:profile-field");
  assert.equal(entries[0].section, "advanced");
  assert.equal(entries[0].label, "Profile field");
  assert.deepEqual(entries[0].aliases, ["profile", "field", "bind", "bio", "name", "headline"]);
});

test("/profile finds the Profile field entry", () => {
  assert.ok(filterSlashCommands("profile").some((c) => c.id === "advanced:profile-field"));
});

test("isReadmePage is true only for the equal id", () => {
  assert.equal(isReadmePage("p1", { readmePageId: "p1" }), true);
  assert.equal(isReadmePage("p2", { readmePageId: "p1" }), false);
  assert.equal(isReadmePage(null, { readmePageId: "p1" }), false);
  assert.equal(isReadmePage(undefined, { readmePageId: "p1" }), false);
  assert.equal(isReadmePage("p1", { readmePageId: null }), false);
  assert.equal(isReadmePage("p1", null), false);
  assert.equal(isReadmePage("", { readmePageId: "" }), false);
});

test("an empty source block is bound in place with one update", () => {
  const { calls, closed } = run([{ id: "b1", type: "paragraph", content: "/profile" }], true);
  assert.equal(closed, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "update");
  assert.deepEqual(calls[0].payload, { content: "", placeholderText: undefined, recordRef: "$record", fieldBind: "displayName" });
});

test("a block with text keeps it and gets one bound block inserted after it", () => {
  const { calls } = run([{ id: "b1", type: "paragraph", content: "Hello /profile" }], true);
  const inserts = calls.filter((c) => c.op === "insert");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].blockId, "b1");
  const block = inserts[0].payload as Block;
  assert.equal(block.recordRef, "$record");
  assert.equal(block.fieldBind, "displayName");
  assert.equal(block.content, "");
  assert.equal(block.type, "paragraph");
  const update = calls.find((c) => c.op === "update");
  assert.equal((update?.payload as Partial<Block>).content, "Hello ");
});

test("a stale menu on a page that is not the README does nothing", () => {
  const { calls } = run([{ id: "b1", type: "paragraph", content: "/profile" }], false);
  assert.deepEqual(calls, []);
});

test("both binding keys survive updateBlock, insertBlock and the page write", async () => {
  const start = pageEntry(PAGE, [para("b1", "")]);
  const bound = applyBlockUpdate("b1", { recordRef: "$record", fieldBind: "headline" })(start);
  const inserted = applyBlockInsert("b1", { id: "b2", type: "heading_1", content: "", recordRef: "$record", fieldBind: "bio", headingLevel: 1 })(bound);
  const bridge = createBridge({ [PAGE]: { version: 1, content: [para("b1", "")] } });
  setBase(PAGE, 1, [para("b1", "")]);
  const outcome = await publishPage(inserted, bridgeDeps(bridge));
  assert.equal(outcome.result, "ok");
  const sent = bridge.patches[0].body.content as Block[];
  assert.deepEqual(sent.map((b) => [b.id, b.recordRef, b.fieldBind, b.content]), [
    ["b1", "$record", "headline", ""],
    ["b2", "$record", "bio", ""],
  ]);
  assert.equal(sent[1].headingLevel, 1);
  clearBase(PAGE);
});
