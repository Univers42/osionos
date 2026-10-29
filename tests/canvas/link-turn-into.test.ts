/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   link-turn-into.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { insertBlockAfterInTree, updateBlockInTree } from "../../src/entities/block/model/blockTreeUtils.ts";
import { linkTurnIntoOptions, soleLinkUrl, turnLinkBlockInto } from "../../src/features/block-editor/model/linkTurnInto.ts";
import { SNAPSHOT, PAGE_URL, linkBlock } from "./link-block-fixtures.ts";

const paragraph = (content: string, extra: Partial<Block> = {}): Block => ({ id: "p1", type: "paragraph", content, ...extra });
const labels = (block: Block) => linkTurnIntoOptions(block).map((option) => `${option.label}${option.active ? "*" : ""}`);

test("embed and bookmark blocks offer Embed, Bookmark and Link with the current one active", () => {
  assert.deepEqual(labels(linkBlock("embed")), ["Embed*", "Bookmark", "Link"]);
  assert.deepEqual(labels(linkBlock("bookmark")), ["Embed", "Bookmark*", "Link"]);
});

test("a paragraph holding exactly one link offers Bookmark and Embed; anything else offers nothing", () => {
  assert.deepEqual(labels(paragraph("[site](https://example.com/a)")), ["Bookmark", "Embed"]);
  assert.deepEqual(labels(paragraph("  [site](https://example.com/a)  ")), ["Bookmark", "Embed"]);
  for (const content of ["", "plain", "see [site](https://example.com/a)", "[a](https://a.example/) [b](https://b.example/)", "[x](javascript:alert(1))", "[x](/relative)"]) {
    assert.deepEqual(labels(paragraph(content)), [], content);
  }
  assert.deepEqual(labels({ id: "h", type: "heading_1", content: "[site](https://example.com/a)" }), []);
  assert.deepEqual(labels(paragraph("[site](https://example.com/a)", { children: [paragraph("kid", { id: "k" })] })), []);
});

test("soleLinkUrl returns the normalized http(s) URL", () => {
  assert.equal(soleLinkUrl(paragraph("[site](https://example.com/a)")), "https://example.com/a");
  assert.equal(soleLinkUrl(paragraph("[x](https://u:p@example.com/)")), "");
});

test("Embed to Bookmark keeps the snapshot and the id; the frame height only follows an embed", () => {
  const embed = linkBlock("embed", { embedHeight: 420 });
  const toBookmark = turnLinkBlockInto(embed, "bookmark");
  assert.ok(toBookmark);
  assert.equal(toBookmark.block.id, embed.id);
  assert.equal(toBookmark.block.type, "bookmark");
  assert.deepEqual(toBookmark.block.embed, SNAPSHOT);
  assert.equal("embedHeight" in toBookmark.block, false);
  assert.equal(toBookmark.needsSnapshot, false);

  const back = turnLinkBlockInto({ ...toBookmark.block, embedHeight: 300 }, "embed");
  assert.equal(back?.block.embedHeight, 300);
  assert.equal(turnLinkBlockInto(embed, "embed"), null, "turning into the current type is not offered");
});

test("a link block without a snapshot asks for one after the turn", () => {
  const bare: Block = { id: "b", type: "bookmark", content: PAGE_URL };
  assert.equal(turnLinkBlockInto(bare, "embed")?.needsSnapshot, true);
});

test("Embed or Bookmark to Link is a paragraph holding [title](url)", () => {
  const linked = turnLinkBlockInto(linkBlock("embed", { embedHeight: 420 }), "link");
  assert.ok(linked);
  assert.equal(linked.block.type, "paragraph");
  assert.equal(linked.block.content, `[${SNAPSHOT.title}](${PAGE_URL})`);
  assert.equal("embed" in linked.block, false);
  assert.equal("embedHeight" in linked.block, false);
  const bare = turnLinkBlockInto({ id: "b", type: "bookmark", content: "https://www.example.com/x" }, "link");
  assert.equal(bare?.block.content, "[www.example.com](https://www.example.com/x)");
});

test("a link paragraph becomes a bookmark or embed on its URL and asks for a snapshot", () => {
  for (const target of ["bookmark", "embed"] as const) {
    const turned = turnLinkBlockInto(paragraph("[site](https://example.com/a)"), target);
    assert.ok(turned);
    assert.equal(turned.block.type, target);
    assert.equal(turned.block.content, "https://example.com/a");
    assert.equal(turned.needsSnapshot, true);
  }
  assert.equal(turnLinkBlockInto(paragraph("[site](https://example.com/a)"), "link"), null);
  assert.equal(turnLinkBlockInto(paragraph("just text"), "embed"), null);
});

test("updateBlockInTree and insertBlockAfterInTree reach nested blocks and leave the input alone", () => {
  const kid = paragraph("kid", { id: "kid" });
  const tree: Block[] = [paragraph("top", { id: "top", children: [kid] }), paragraph("last", { id: "last" })];
  const updated = updateBlockInTree(tree, "kid", (block) => ({ ...block, content: "changed" }));
  assert.equal(updated[0].children?.[0].content, "changed");
  assert.equal(updated[1], tree[1], "untouched siblings are shared");
  assert.equal(tree[0].children?.[0].content, "kid");
  assert.equal(updateBlockInTree(tree, "missing", (block) => block), tree);

  const added = paragraph("new", { id: "new" });
  assert.deepEqual(insertBlockAfterInTree(tree, "top", added).map((b) => b.id), ["top", "new", "last"]);
  assert.deepEqual(insertBlockAfterInTree(tree, "kid", added)[0].children?.map((b) => b.id), ["kid", "new"]);
  assert.equal(insertBlockAfterInTree(tree, "missing", added), tree);
});

test("Turn into Link does not throw on a hand-written embed whose title is not a string", () => {
  const hostile = { id: "h", type: "embed", content: "https://a.io", embed: { title: 5 } } as unknown as Block;
  const result = turnLinkBlockInto(hostile, "link");
  assert.notEqual(result, null);
  assert.equal(result?.block.type, "paragraph");
  assert.match(result?.block.content ?? "", /^\[[^\]]*\]\(https:\/\/a\.io\/?\)$/);
  const wellFormedButTyped = { ...hostile, embed: { ...SNAPSHOT, title: 5 } } as unknown as Block;
  assert.doesNotThrow(() => turnLinkBlockInto(wellFormedButTyped, "link"));
});
