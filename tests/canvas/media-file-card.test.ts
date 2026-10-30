/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   media-file-card.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #177: a file or audio card drew the file's own URL as its icon, so every
// non-image upload (a PDF in the chat composer, the gallery, the editor) showed
// a broken image. The card's icon is the kind's glyph; only image blocks draw the file.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Block } from "@/entities/block";
import { MediaBlockPreview } from "@/entities/block/ui/MediaBlockPreview";

const card = (type: "file" | "audio", url: string) =>
  renderToStaticMarkup(React.createElement(MediaBlockPreview, { block: { id: "b1", type, content: "", asset: `url:${url}` } as Block }));

test("a file card links the file and draws a glyph, never the file as an image", () => {
  const html = card("file", "blob:https://app.test/9f1c");
  assert.match(html, /href="blob:https:\/\/app\.test\/9f1c"/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<svg/);
});

test("an audio card plays the file and draws a glyph, never the file as an image", () => {
  const html = card("audio", "https://bridge.test/api/chat/uploads/a1");
  assert.match(html, /<source src="https:\/\/bridge\.test\/api\/chat\/uploads\/a1"/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<svg/);
});
