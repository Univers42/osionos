/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-media-embed.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A video/audio/file block stores the resolved provider snapshot in `embed`, which has no
// markdown form: it travels in the page file's block overlay, validated on the way in.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { SNAPSHOT } from "./link-block-fixtures.ts";

const pageOf = (content: Block[]): PageEntry => ({ _id: "p-media", workspaceId: "ws", title: "Media", content });
const roundTrip = (content: Block[]): Block[] => fileToPage(pageToFile(pageOf(content))).content ?? [];

test("video, audio and file blocks keep their provider snapshot through the page file", () => {
  for (const type of ["video", "audio", "file"] as const) {
    const [back] = roundTrip([{ id: `m-${type}`, type, content: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", embed: SNAPSHOT }]);
    assert.equal(back.type, type);
    assert.deepEqual(back.embed, SNAPSHOT, type);
  }
});

test("a block type with no embed concept does not smuggle one through the overlay", () => {
  const [back] = roundTrip([{ id: "p", type: "paragraph", content: "hello", embed: SNAPSHOT }]);
  assert.equal(back.embed, undefined);
});

test("an over-cap snapshot is dropped on write, and a hostile one on read, without throwing", () => {
  const huge = { ...SNAPSHOT, description: "x".repeat(200_000), title: "y".repeat(100), extra: "z".repeat(70_000) };
  const [dropped] = roundTrip([{ id: "v", type: "video", content: "https://youtu.be/x", embed: huge as never }]);
  assert.equal(dropped.embed, undefined, "the 64 KB cap applies");

  const written = pageToFile(pageOf([{ id: "v2", type: "video", content: "https://youtu.be/x", embed: SNAPSHOT }]));
  const forged = written.replace(/"https:\/\/i\.vimeocdn\.example[^"]*"/, '"javascript:alert(1)"');
  assert.notEqual(forged, written, "the fixture image must appear in the file");
  const [read] = fileToPage(forged).content ?? [];
  assert.equal(read.embed === undefined || read.embed.image === "", true, "an unsafe image URL never survives a read");
});
