/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   link-blocks.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { getBlockCategory } from "../../src/entities/block/model/blockCategories.ts";
import { estimateBlockHeight } from "../../src/entities/block/model/blockVirtualization.ts";
import { createLinkBlock, isLinkBlockType, sanitizeLinkBlockFields } from "../../src/entities/block/model/linkBlocks.ts";
import { EMBED_BLOCK_TYPES } from "../../src/features/block-editor/model/marqueeGeometry.ts";
import { HOSTILE_SNAPSHOT, PAGE_URL, SNAPSHOT, linkBlock } from "./link-block-fixtures.ts";

test("createLinkBlock keeps the URL in content so an older build still shows the link", () => {
  const block = createLinkBlock("embed", PAGE_URL, SNAPSHOT);
  assert.equal(block.type, "embed");
  assert.equal(block.content, PAGE_URL);
  assert.deepEqual(block.embed, SNAPSHOT);
  assert.equal("embed" in createLinkBlock("bookmark", PAGE_URL), false);
});

test("isLinkBlockType accepts exactly embed and bookmark", () => {
  assert.equal(isLinkBlockType("embed"), true);
  assert.equal(isLinkBlockType("bookmark"), true);
  for (const other of ["whiteboard", "video", "paragraph", ""]) assert.equal(isLinkBlockType(other), false);
});

test("embed and bookmark are void leaves like the whiteboard", () => {
  for (const type of ["embed", "bookmark"] as const) {
    assert.deepEqual(getBlockCategory(type), getBlockCategory("whiteboard"));
    assert.equal(EMBED_BLOCK_TYPES.includes(type), true);
    assert.ok(estimateBlockHeight({ id: "x", type, content: "" }) > 0);
  }
  assert.ok(estimateBlockHeight({ id: "x", type: "embed", content: "" }) > estimateBlockHeight({ id: "x", type: "bookmark", content: "" }));
});

test("sanitize returns the same array when every snapshot is valid", () => {
  const blocks = [linkBlock("embed", { embedHeight: 400 }), linkBlock("bookmark")];
  assert.equal(sanitizeLinkBlockFields(blocks), blocks);
});

test("sanitize drops a snapshot that fails validation but keeps the URL", () => {
  const [out] = sanitizeLinkBlockFields([linkBlock("bookmark", { embed: { ...SNAPSHOT, kind: "nope" } as never })]);
  assert.equal(out.embed, undefined);
  assert.equal(out.content, PAGE_URL);
});

test("sanitize scrubs hostile URLs inside a snapshot and recurses into children", () => {
  const parent = { id: "p", type: "toggle" as const, content: "t", children: [linkBlock("embed", { embed: HOSTILE_SNAPSHOT as never })] };
  const [out] = sanitizeLinkBlockFields([parent]);
  const inner = out.children?.[0].embed;
  assert.ok(inner);
  assert.equal(inner.image, "");
  assert.equal(inner.favicon, "");
  assert.equal(inner.player, null);
});

test("sanitize removes a non-finite embedHeight and keeps a finite one", () => {
  const out = sanitizeLinkBlockFields([linkBlock("embed", { embedHeight: Number.NaN }), linkBlock("embed", { embedHeight: 300 })]);
  assert.equal("embedHeight" in out[0], false);
  assert.equal(out[1].embedHeight, 300);
});
