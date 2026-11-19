/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-cover-size.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// groot ADR 0064 PS24/PS27: `.omd` reads cover_height and cover_width through the same validator
// as the server path. The writer names them only for a page that has them, so every file
// written for a page without them stays byte-identical to what develop wrote before.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { patchFromMeta } from "../../src/features/page-file/model/pageFileMeta.ts";
import { META_PAGE, page } from "./page-file-codec-fixtures.ts";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const SIZED: PageEntry = { ...META_PAGE, coverHeight: 320, coverWidth: "content" };

// pageToFile output on origin/develop 50406aa92, before the cover size keys existed.
test("a page without a cover size writes the same bytes as before", () => {
  assert.equal(sha(pageToFile(META_PAGE)), "851007ef4d43b6eaadaa6a8a7db6e80be0fdf868973e794bac91cfee9733f9be");
  assert.equal(sha(pageToFile(page)), "64dd32ca0252daf89956ccf30d2bd81294fde6150029ac73812ad55dc5e561dc");
});

test("a sized page writes both keys, and removing them gives the unsized file", () => {
  const sized = pageToFile(SIZED);
  assert.match(sized, /^cover_height: 320$/m);
  assert.match(sized, /^cover_width: "content"$/m);
  const stripped = sized.replace("cover_height: 320\n", "").replace('cover_width: "content"\n', "");
  assert.equal(stripped, pageToFile(META_PAGE));
});

test("round trip: page → file → page keeps the cover size", () => {
  const { patch } = fileToPage(pageToFile(SIZED), SIZED);
  assert.equal(patch.coverHeight, 320);
  assert.equal(patch.coverWidth, "content");
  assert.equal(patch.coverPosition, 25);
});

test("round trip: file → page → file is byte-identical, with and without a cover size", () => {
  for (const source of [SIZED, META_PAGE, page]) {
    const file = pageToFile(source);
    const { patch, content } = fileToPage(file, source);
    assert.equal(pageToFile({ ...source, ...patch, content }), file);
  }
});

test("a hand-edited cover size is validated: clamped height, unknown width dropped", () => {
  assert.deepEqual(patchFromMeta({ cover_height: 4000, cover_width: "content" }), {
    coverHeight: 640,
    coverWidth: "content",
  });
  assert.deepEqual(patchFromMeta({ cover_height: 99.7 }), { coverHeight: 120 });
  assert.deepEqual(patchFromMeta({ cover_height: "300", cover_width: "wide" }), {});
  assert.deepEqual(patchFromMeta({ cover_height: null, cover_width: null }), {});
});

test("fileToPage's meta echoes the validated cover size", () => {
  const { meta } = fileToPage(pageToFile(SIZED), SIZED);
  assert.equal(meta.cover_height, 320);
  assert.equal(meta.cover_width, "content");
});
