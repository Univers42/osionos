/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paste-link-menu.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  PASTE_CHOICES,
  applyPasteChoice,
  cleanMentionTitle,
  defaultPasteChoice,
  insertPastedLink,
  isPasteMenuBlock,
  mentionLinkSource,
  withMentionTitle,
} from "../../src/features/block-editor/model/pasteLinkMenu.ts";
import { applySnapshot } from "../../src/features/block-editor/model/linkSnapshotApply.ts";
import { SNAPSHOT } from "./link-block-fixtures.ts";

const URL_A = "https://example.com/a";
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const LINK_A = "[example.com](https://example.com/a)";
const paragraph = (content: string, extra: Partial<Block> = {}): Block => ({ id: "p1", type: "paragraph", content, ...extra });

function pasted(content: string, url: string, at: number, end = at) {
  const result = insertPastedLink(content, url, { start: at, end });
  return { block: paragraph(result.content), context: result.context };
}

test("the menu offers URL, Mention, Bookmark, Embed in that order", () => {
  assert.deepEqual(PASTE_CHOICES.map((entry) => entry.choice), ["url", "mention", "bookmark", "embed"]);
});

test("defaultPasteChoice: Embed for a provider URL, URL for any other page", () => {
  assert.equal(defaultPasteChoice(YOUTUBE), "embed");
  assert.equal(defaultPasteChoice(URL_A), "url");
  assert.equal(defaultPasteChoice("https://example.com/watch?v=dQw4w9WgXcQ"), "url");
});

test("insertPastedLink replaces the selection with [host](url) and reports its range", () => {
  const { content, context } = insertPastedLink("say  now", `  ${URL_A}\n`, { start: 4, end: 4 });
  assert.equal(content, `say ${LINK_A} now`);
  assert.equal(content.slice(context.start, context.end), LINK_A);
  const replaced = insertPastedLink("abc XYZ def", URL_A, { start: 7, end: 4 });
  assert.equal(replaced.content, `abc ${LINK_A} def`);
  assert.equal(insertPastedLink("x", URL_A, { start: 99, end: 99 }).content, `x${LINK_A}`);
});

test("only page-body text blocks offer the menu", () => {
  for (const type of ["paragraph", "heading_2", "bulleted_list", "to_do", "quote", "callout", "toggle"] as const) {
    assert.equal(isPasteMenuBlock({ id: "b", type, content: "" }), true, type);
  }
  for (const type of ["code", "table_block", "embed", "bookmark", "equation", "database_inline"] as const) {
    assert.equal(isPasteMenuBlock({ id: "b", type, content: "" }), false, type);
  }
});

test("URL keeps the pasted link untouched", () => {
  const { block, context } = pasted("", URL_A, 0);
  assert.equal(applyPasteChoice("url", block, context), null);
});

test("Bookmark and Embed convert a block holding only the link, in place", () => {
  for (const choice of ["bookmark", "embed"] as const) {
    const { block, context } = pasted("  ", URL_A, 1);
    const edit = applyPasteChoice(choice, { ...block, embed: SNAPSHOT, embedHeight: 300 }, context);
    assert.ok(edit);
    assert.equal(edit.inserted, null);
    assert.equal(edit.block.id, "p1");
    assert.equal(edit.block.type, choice);
    assert.equal(edit.block.content, URL_A);
    assert.equal("embed" in edit.block, false, "a stale snapshot of another URL is dropped");
    assert.equal("embedHeight" in edit.block, false);
  }
});

test("a link inside text keeps the sentence and inserts a new block after", () => {
  for (const choice of ["bookmark", "embed"] as const) {
    const { block, context } = pasted("see  now", URL_A, 4);
    const edit = applyPasteChoice(choice, block, context);
    assert.ok(edit);
    assert.equal(edit.block.type, "paragraph");
    assert.equal(edit.block.content, "see now");
    assert.ok(edit.inserted);
    assert.equal(edit.inserted.type, choice);
    assert.equal(edit.inserted.content, URL_A);
    assert.notEqual(edit.inserted.id, block.id);
  }
});

test("a block with children is never converted in place", () => {
  const { block, context } = pasted("", URL_A, 0);
  const child: Block = { id: "c", type: "paragraph", content: "kid" };
  const edit = applyPasteChoice("embed", { ...block, children: [child] }, context);
  assert.ok(edit?.inserted);
  assert.equal(edit.block.type, "paragraph");
  assert.equal(edit.block.content, "");
  assert.deepEqual(edit.block.children, [child]);
});

test("Mention marks the link with the reserved title and keeps the text around it", () => {
  const { block, context } = pasted("see  now", URL_A, 4);
  const edit = applyPasteChoice("mention", block, context);
  assert.ok(edit);
  assert.equal(edit.inserted, null);
  assert.equal(edit.block.type, "paragraph");
  assert.equal(edit.block.content, 'see [example.com](https://example.com/a "osio:mention") now');
});

test("a choice made after the link was edited away changes nothing", () => {
  const { context } = pasted("see  now", URL_A, 4);
  for (const choice of ["mention", "bookmark", "embed"] as const) {
    assert.equal(applyPasteChoice(choice, paragraph("they deleted it"), context), null);
  }
});

test("the link is found again when text before it moved", () => {
  const { block, context } = pasted("tail", URL_A, 4);
  const shifted = { ...block, content: `typed ${block.content}` };
  const edit = applyPasteChoice("mention", shifted, context);
  assert.equal(edit?.block.content, `typed tail${mentionLinkSource("example.com", URL_A)}`);
});

test("withMentionTitle swaps the link text for the resolved title, once", () => {
  const { block, context } = pasted("see  now", URL_A, 4);
  const mention = applyPasteChoice("mention", block, context)?.block.content ?? "";
  const titled = withMentionTitle(mention, context, "Example Domain");
  assert.equal(titled, 'see [Example Domain](https://example.com/a "osio:mention") now');
  assert.equal(withMentionTitle(titled ?? "", context, "Again"), null, "the host text is gone, nothing to retitle");
  assert.equal(withMentionTitle("unrelated", context, "T"), null);
});

test("cleanMentionTitle cannot break the link syntax", () => {
  assert.equal(cleanMentionTitle("a [b]\n c", URL_A), "a b c");
  assert.equal(cleanMentionTitle("   ", URL_A), "example.com");
  assert.equal(cleanMentionTitle("x".repeat(500), URL_A).length, 120);
  assert.equal(mentionLinkSource("]( evil", URL_A), `[( evil](${URL_A} "osio:mention")`);
});

test("applySnapshot titles a mention and stores a block snapshot, only while they still match", () => {
  const { block, context } = pasted("see  now", URL_A, 4);
  const mentionBlock = applyPasteChoice("mention", block, context)?.block as Block;
  const snapshot = { ...SNAPSHOT, title: "Example Domain" };
  const titled = applySnapshot([mentionBlock], { kind: "mention", blockId: "p1", context }, snapshot);
  assert.match(titled[0].content ?? "", /\[Example Domain\]\(https:\/\/example\.com\/a "osio:mention"\)/);

  const embed: Block = { id: "e1", type: "embed", content: URL_A };
  assert.deepEqual(applySnapshot([embed], { kind: "block", blockId: "e1", url: URL_A }, snapshot)[0].embed, snapshot);
  const unchanged = [{ ...embed, content: "https://other.example/" }];
  assert.equal(applySnapshot(unchanged, { kind: "block", blockId: "e1", url: URL_A }, snapshot), unchanged);
  const turnedBack = [paragraph(URL_A, { id: "e1" })];
  assert.equal(applySnapshot(turnedBack, { kind: "block", blockId: "e1", url: URL_A }, snapshot), turnedBack);
});

test("C18: no choice, default or edit in the model touches the network", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.reject(new Error("network is off limits before a choice"));
  }) as typeof fetch;
  try {
    for (const url of [URL_A, YOUTUBE]) {
      const { block, context } = pasted("see  now", url, 4);
      defaultPasteChoice(url);
      for (const entry of PASTE_CHOICES) applyPasteChoice(entry.choice, block, context);
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
  // Static guard: the model must not even import the resolver.
  const source = readFileSync(new URL("../../src/features/block-editor/model/pasteLinkMenu.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "[^"]*(linkSnapshot|embedBridge|shared\/lib\/embed)"|fetch\(/);
});

test("C18: only the attach hook resolves, and the paste hook never imports the resolver", () => {
  const read = (name: string) => readFileSync(new URL(`../../src/features/block-editor/model/${name}`, import.meta.url), "utf8");
  assert.doesNotMatch(read("usePasteLinkMenu.ts"), /resolveLinkSnapshot|resolveEmbed|\.\/linkSnapshot"/);
  assert.match(read("useLinkSnapshotAttach.ts"), /resolveLinkSnapshot\(requestedUrl\(request\)\)/);
});
