import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderInlineToReact } from "@osionos/markdown-engine/react";

import type { Block } from "../../src/entities/block/model/types.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";

// The owner's native README (a .omd page file) through the real codec: it must parse into
// blocks, keep all 24 images, and survive serialise -> parse unchanged.

const OMD = readFileSync(new URL("../fixtures/profile/readme.omd", import.meta.url), "utf8");

const strip = (blocks: Block[]): unknown[] =>
  blocks.map(({ id: _id, children, ...rest }) => ({ ...rest, ...(children ? { children: strip(children) } : {}) }));

const flatten = (blocks: Block[]): Block[] => blocks.flatMap((block) => [block, ...flatten(block.children ?? [])]);

function countImages(blocks: Block[]): number {
  let total = 0;
  for (const block of flatten(blocks)) {
    if (block.type === "image" && block.asset) total += 1;
    if (block.type === "code" || block.type === "image") continue;
    for (const text of [block.content, ...(block.tableData ?? []).flat()]) {
      if (!text) continue;
      const markup = renderToStaticMarkup(React.createElement("div", null, renderInlineToReact(text, {})));
      total += (markup.match(/<img /g) ?? []).length;
    }
  }
  return total;
}

test("readme.omd parses without a front matter error and yields blocks", () => {
  const parsed = fileToPage(OMD);
  assert.equal(parsed.frontMatterError ?? null, null);
  assert.equal(flatten(parsed.content).length, 61);
  assert.equal(parsed.content.length, 26);
});

test("readme.omd keeps all 24 images", () => {
  assert.equal(countImages(fileToPage(OMD).content), 24);
});

test("readme.omd serialise -> parse round trip is stable", () => {
  const first = fileToPage(OMD).content;
  const page = { _id: "p", workspaceId: "w", title: "README", content: first };
  const again = fileToPage(pageToFile(page as never)).content;
  // JSON, not deepEqual: the codec drops keys whose value is undefined.
  assert.equal(JSON.stringify(strip(again)), JSON.stringify(strip(first)));
});
