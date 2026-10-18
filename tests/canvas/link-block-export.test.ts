/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   link-block-export.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { renderBlocksHtml } from "../../src/features/page-export/model/exportHtml.ts";
import { exportPageMarkdown } from "../../src/features/page-export/model/exportMarkdown.ts";
import { flattenBlocksToPdfLines } from "../../src/features/page-export/model/exportPdfLines.ts";
import { HOSTILE_SNAPSHOT, PAGE_URL, SNAPSHOT, linkBlock } from "./link-block-fixtures.ts";

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const opts = { content: "everything" } as const;
const html = (...blocks: ReturnType<typeof linkBlock>[]): string => renderBlocksHtml(blocks, opts, () => null);
const md = (styling: "styled" | "raw", ...blocks: ReturnType<typeof linkBlock>[]): string =>
  exportPageMarkdown("T", blocks, { ...opts, styling }, () => null);
const pdf = (...blocks: ReturnType<typeof linkBlock>[]): string[] =>
  flattenBlocksToPdfLines(blocks, opts, () => null).map((line) => line.text);

test("markdown: embed and bookmark are a [title](url) line", () => {
  const out = md("styled", linkBlock("embed"), linkBlock("bookmark", { embed: undefined }));
  assert.match(out, new RegExp(`^\\[${SNAPSHOT.title.replace(/[()]/g, "\\$&")}\\]\\(${PAGE_URL}\\)$`, "m"));
  assert.match(out, new RegExp(`^\\[${PAGE_URL.replace(/[./]/g, "\\$&")}\\]\\(${PAGE_URL}\\)$`, "m"));
});

test("markdown: raw styling keeps the re-importable fence", () => {
  assert.match(md("raw", linkBlock("embed")), /```osiembed/);
});

test("markdown: a hostile title cannot break out of the link and an unsafe URL is not linked", () => {
  const title = md("styled", linkBlock("bookmark", { embed: { ...SNAPSHOT, title: "a](javascript:alert(1)) [b" } }));
  assert.match(title, /\[a\\\]\(javascript:alert\(1\)\) \\\[b\]\(https:\/\/vimeo\.example\/76979871\)/);
  const unsafe = md("styled", linkBlock("embed", { content: "javascript:alert(1)", embed: undefined }));
  assert.equal(unsafe.includes("]("), false);
});

test("html: a generic embed is a sandboxed iframe with the generic allow list, then a link", () => {
  const out = html(linkBlock("embed", { embed: { ...SNAPSHOT, player: null } }));
  assert.match(out, /<iframe src="https:\/\/vimeo\.example\/76979871"/);
  assert.match(out, /sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"/);
  assert.match(out, /allow="fullscreen; picture-in-picture"/);
  assert.match(out, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(out, /<a href="https:\/\/vimeo\.example\/76979871"/);
});

test("html: a provider URL frames the provider src with the provider allow list", () => {
  const out = html(linkBlock("embed", { content: YOUTUBE, embed: undefined }));
  assert.match(out, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(out, /allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share"/);
});

test("html: the frame height is the clamped embedHeight", () => {
  const out = html(linkBlock("embed", { embed: undefined, embedHeight: 99999 }));
  assert.match(out, /height:1600px/);
});

test("html: a bookmark is a card link with escaped title and description, and no iframe", () => {
  const out = html(linkBlock("bookmark", { embed: HOSTILE_SNAPSHOT as never }));
  assert.equal(out.includes("<iframe"), false);
  assert.equal(out.includes("<script>"), false);
  assert.equal(out.includes("<img"), false);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;x&quot; &amp; co/);
  assert.match(out, /<a href="https:\/\/vimeo\.example\/76979871"/);
});

test("html: a hostile snapshot never reaches a src or href", () => {
  const out = html(linkBlock("embed", { embed: HOSTILE_SNAPSHOT as never }));
  assert.equal(/javascript:|data:text/.test(out), false);
  assert.equal(out.includes("<script>"), false);
});

test("html: an unsafe stored URL is inert escaped text", () => {
  for (const type of ["embed", "bookmark"] as const) {
    const out = html(linkBlock(type, { content: 'javascript:alert("x")<b>', embed: undefined }));
    assert.equal(out.includes("<a "), false);
    assert.equal(out.includes("<iframe"), false);
    assert.equal(out.includes("<b>"), false);
    assert.match(out, /^<p>javascript:alert\(&quot;x&quot;\)&lt;b&gt;<\/p>$/);
  }
});

test("html: a URL on a refused/unsafe frame degrades to the link only", () => {
  const out = html(linkBlock("embed", { embed: { ...SNAPSHOT, frameable: false } }));
  assert.equal(out.includes("<iframe"), false);
  assert.match(out, /<a href=/);
});

test("pdf: one link line per block, URL as text", () => {
  assert.deepEqual(pdf(linkBlock("embed"), linkBlock("bookmark", { embed: undefined })), [
    `[embed] ${SNAPSHOT.title} - ${PAGE_URL}`,
    `[bookmark] ${PAGE_URL}`,
  ]);
});
