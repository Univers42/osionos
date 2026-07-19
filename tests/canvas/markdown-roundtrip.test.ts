/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-roundtrip.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../src/shared/lib/markengine/markdown/shortcuts.ts";

let seq = 0;
const make = (block: Partial<Block> & { type: Block["type"] }): Block => ({
  id: `b${seq++}`,
  content: "",
  ...block,
});

/** Serialize a single block, parse it back, return the first round-tripped block. */
function roundTrip(block: Block): Block {
  const markdown = serializeBlocksToMarkdown([block]);
  const parsed = parseMarkdownToBlocks(markdown);
  assert.equal(parsed.length, 1, `expected one block from:\n${markdown}`);
  return parsed[0];
}

test("every heading level survives the round-trip (incl. h4-h6)", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const out = roundTrip(make({ type: `heading_${level}`, content: `Title ${level}` }));
    assert.equal(out.type, `heading_${level}`);
    assert.equal(out.content, `Title ${level}`);
  }
});

test("paragraph, quote and divider survive", () => {
  assert.equal(roundTrip(make({ type: "paragraph", content: "Hello world" })).content, "Hello world");
  const quote = roundTrip(make({ type: "quote", content: "A quote" }));
  assert.equal(quote.type, "quote");
  assert.equal(quote.content, "A quote");
  assert.equal(roundTrip(make({ type: "divider" })).type, "divider");
});

test("toggle survives as a toggle (not a quote)", () => {
  const out = roundTrip(make({ type: "toggle", content: "Toggle summary" }));
  assert.equal(out.type, "toggle");
  assert.equal(out.content, "Toggle summary");
  assert.equal(out.headingLevel, undefined);
});

test("a toggle heading keeps its level through the round-trip", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const out = roundTrip(make({ type: "toggle", content: `Toggle h${level}`, headingLevel: level }));
    assert.equal(out.type, "toggle");
    assert.equal(out.content, `Toggle h${level}`);
    assert.equal(out.headingLevel, level);
  }
});

test("callout survives with its icon and title", () => {
  const out = roundTrip(make({ type: "callout", content: "Heads up", color: "⚠️" }));
  assert.equal(out.type, "callout");
  assert.equal(out.content, "Heads up");
  assert.equal(out.color, "⚠️");
});

test("lists and to-dos survive with checked state", () => {
  assert.equal(roundTrip(make({ type: "bulleted_list", content: "Bullet" })).type, "bulleted_list");
  assert.equal(roundTrip(make({ type: "numbered_list", content: "Number" })).type, "numbered_list");
  const done = roundTrip(make({ type: "to_do", content: "Task", checked: true }));
  assert.equal(done.type, "to_do");
  assert.equal(done.checked, true);
  const open = roundTrip(make({ type: "to_do", content: "Task", checked: false }));
  assert.equal(open.checked, false);
});

test("code keeps its language and body", () => {
  const out = roundTrip(make({ type: "code", content: "const a = 1;", language: "js" }));
  assert.equal(out.type, "code");
  assert.equal(out.content, "const a = 1;");
  assert.equal(out.language, "js");
});

test("equation survives as an equation block", () => {
  const out = roundTrip(make({ type: "equation", content: "E = mc^2" }));
  assert.equal(out.type, "equation");
  assert.equal(out.content, "E = mc^2");
});

test("table survives with its cell data", () => {
  // Editor tables are normalized to a 3-column minimum, so use a realistic shape.
  const out = roundTrip(
    make({ type: "table_block", tableData: [["A", "B", "C"], ["1", "2", "3"]] }),
  );
  assert.equal(out.type, "table_block");
  assert.deepEqual(out.tableData, [["A", "B", "C"], ["1", "2", "3"]]);
});

test("image block survives with asset, alt and caption", () => {
  const out = roundTrip(
    make({ type: "image", asset: "https://a.io/x.png", mediaAlt: "An x", content: "The caption" }),
  );
  assert.equal(out.type, "image");
  assert.equal(out.asset, "https://a.io/x.png");
  assert.equal(out.mediaAlt, "An x");
  assert.equal(out.content, "The caption");
});

test("video, audio and file blocks survive with their asset", () => {
  const video = roundTrip(make({ type: "video", asset: "https://a.io/v.mp4", content: "Clip" }));
  assert.equal(video.type, "video");
  assert.equal(video.asset, "https://a.io/v.mp4");
  assert.equal(video.content, "Clip");

  const audio = roundTrip(make({ type: "audio", asset: "https://a.io/a.mp3" }));
  assert.equal(audio.type, "audio");
  assert.equal(audio.asset, "https://a.io/a.mp3");

  const file = roundTrip(make({ type: "file", asset: "https://a.io/f.pdf", fileName: "spec.pdf" }));
  assert.equal(file.type, "file");
  assert.equal(file.asset, "https://a.io/f.pdf");
  assert.equal(file.fileName, "spec.pdf");
});

test("a drawing keeps its scene JSON and canvas height", () => {
  const scene = '{"strokes":[1,2]}';
  const out = roundTrip(make({ type: "draw", content: scene, drawHeight: 512 }));
  assert.equal(out.type, "draw");
  assert.equal(out.content, scene);
  assert.equal(out.drawHeight, 512);
});

test("button survives with label, href and variant", () => {
  const out = roundTrip(
    make({ type: "button", buttonLabel: "Go", buttonHref: "page://abc", buttonVariant: "secondary" }),
  );
  assert.equal(out.type, "button");
  assert.equal(out.buttonLabel, "Go");
  assert.equal(out.buttonHref, "page://abc");
  assert.equal(out.buttonVariant, "secondary");
});

test("database, graph and home embeds survive with their config", () => {
  const inline = roundTrip(
    make({ type: "database_inline", databaseId: "db1", viewId: "v2", recordLimit: 25 }),
  );
  assert.equal(inline.type, "database_inline");
  assert.equal(inline.databaseId, "db1");
  assert.equal(inline.viewId, "v2");
  assert.equal(inline.recordLimit, 25);

  const fullPage = roundTrip(make({ type: "database_full_page", databaseId: "db9" }));
  assert.equal(fullPage.type, "database_full_page");
  assert.equal(fullPage.databaseId, "db9");

  assert.equal(roundTrip(make({ type: "graph_view" })).type, "graph_view");
  assert.equal(roundTrip(make({ type: "home_views" })).type, "home_views");
});

test("a column layout round-trips as :::columns / :::column containers", () => {
  const out = roundTrip(
    make({
      type: "column_list",
      children: [
        make({
          type: "column",
          widthRatio: 0.4,
          children: [make({ type: "paragraph", content: "Left cell" })],
        }),
        make({
          type: "column",
          widthRatio: 0.6,
          children: [make({ type: "heading_2", content: "Right title" })],
        }),
      ],
    }),
  );
  assert.equal(out.type, "column_list");
  assert.equal(out.children?.length, 2);
  const [left, right] = out.children ?? [];
  assert.equal(left.type, "column");
  assert.equal(left.widthRatio, 0.4);
  assert.equal(left.children?.[0].content, "Left cell");
  assert.equal(right.type, "column");
  assert.equal(right.widthRatio, 0.6);
  assert.equal(right.children?.[0].type, "heading_2");
});

test("a malformed osi* fence stays a visible code block, never data loss", () => {
  const parsed = parseMarkdownToBlocks("```osibutton\nnot json at all\n```");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].type, "code");
  assert.equal(parsed[0].content, "not json at all");
});
