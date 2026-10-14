/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-codec.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { EXTRA_BLOCK_KEYS } from "../../src/features/page-file/model/blockOverlay.ts";
import {
  KNOWN_LOSSY_KEYS,
  MARKDOWN_KEYS,
  OVERLAY_KEYS,
  fileToPage,
  isFolderMetaName,
  isPageFileName,
  pageToFile,
} from "../../src/features/page-file/model/pageFileCodec.ts";
import { metaFromPage, patchFromMeta } from "../../src/features/page-file/model/pageFileMeta.ts";
import { withoutLegacyUpdated } from "../../src/features/page-file/model/frontMatter.ts";
import { META_PAGE, MARKDOWN_PROBES, OVERLAY_PROBES, blockFieldNames, corpus, insertAtTop, page, viaMarkdown } from "./page-file-codec-fixtures.ts";

const write = (source: PageEntry): string => pageToFile(source);
const read = (source: PageEntry): ReturnType<typeof fileToPage> => fileToPage(write(source), source);

test("a corpus of markdown and overlay constructs round-trips losslessly: content, ids, attributes", () => {
  const done = read(page);
  assert.deepEqual(done.content, structuredClone(corpus));
  assert.deepEqual(done.content.map((b) => b.id), corpus.map((b) => b.id));
});

test("pageToFile is deterministic: a clone and a key reorder give the same bytes", () => {
  const once = write(page);
  assert.equal(write(structuredClone(page)), once);
  const reordered = { content: page.content, _id: page._id, title: page.title, workspaceId: page.workspaceId };
  assert.equal(write(reordered), once);
});

test("the patch restores every front-matter meta field", () => {
  const done = read(META_PAGE);
  assert.deepEqual(done.patch, {
    title: "Meta", icon: "📄", cover: "https://c.io/x.png", coverPosition: 25, surface: "wiki",
    visibility: "shared", databaseId: "db-9", isTemplate: true, isDefaultTemplate: true,
    templateSurface: "marketplace-app", recurrence: { every: "week", nextDueAt: "2026-11-01" },
    properties: [{ key: "Status", label: "Status", type: "select", value: "Live" }],
  });
  assert.equal(done.meta.id, "p-meta");
  assert.equal(done.meta.updated, undefined, "updatedAt is the server's, never the file's (finding 19)");
});

test("a page that only moved updatedAt writes the same bytes; a legacy updated: line still reads", () => {
  assert.equal(write({ ...META_PAGE, updatedAt: "2031-01-01T00:00:00.000Z" }), write(META_PAGE));
  const today = write(META_PAGE);
  const legacy = today.replace('title: "Meta"\n', 'title: "Meta"\nupdated: "2026-10-01T00:00:00.000Z"\n');
  assert.notEqual(legacy, today);
  assert.deepEqual(fileToPage(legacy, META_PAGE).patch, read(META_PAGE).patch);
  assert.equal(withoutLegacyUpdated(legacy), today);
  assert.equal(withoutLegacyUpdated(today), today);
  const body = "---\ntitle: \"x\"\n---\nupdated: \"kept, it is the body\"\n";
  assert.equal(withoutLegacyUpdated(body), body, "only the front matter loses the line");
});

test("metaFromPage omits absent, null and empty fields", () => {
  const meta = metaFromPage({
    _id: "p", workspaceId: "ws", title: "T", surface: "page", visibility: undefined,
    databaseId: null, recurrence: null, properties: [],
  });
  assert.deepEqual(meta, { id: "p", title: "T" });
});

test("patchFromMeta drops invalid values and never returns identity fields", () => {
  const patch = patchFromMeta({
    cover_position: 500, surface: "evil", title: 5, id: "nope", updated: "x",
    workspaceId: "ws", content: [{}], unknown: 1, template: "yes",
  });
  assert.deepEqual(patch, {});
  for (const key of ["_id", "workspaceId", "content", "updatedAt"]) {
    assert.equal(key in patch, false, `${key} must never be in a patch`);
  }
});

test("a hand edit that inserts a paragraph misaligns the overlay and loses nothing", () => {
  const done = fileToPage(insertAtTop(write(page), "Inserted paragraph"), page);
  assert.equal(done.frontMatterError, null);
  assert.equal(done.content[0]?.content, "Inserted paragraph");
  // Entry "0" still matches on type (paragraph), so the inserted block borrows
  // the first block's id: the overlay is aligned by position, nothing better is
  // available to it. Shifted positions that mismatch keep their parsed ids.
  assert.equal(done.content[0]?.id, corpus[0]?.id);
  assert.equal(done.content[1]?.id === corpus[1]?.id, false);
  assert.equal(new Set(done.content.map((b) => b.id)).size, done.content.length);
  const body = JSON.stringify(done.content);
  for (const text of ["Plain text", "Inside", "Nested", "const a = 1;"]) {
    assert.ok(body.includes(text), `${text} survives the hand edit`);
  }
});

test("plain Markdown without front-matter parses with empty meta", () => {
  const done = fileToPage("# Hi\n\nThere");
  assert.deepEqual(done.meta, {});
  assert.deepEqual(done.patch, {});
  assert.equal(done.frontMatterError, null);
  assert.deepEqual(
    done.content.map((b) => [b.type, b.content]),
    [["heading_1", "Hi"], ["paragraph", "There"]],
  );
});

test("broken front-matter keeps the whole text as the body and sets the error", () => {
  const done = fileToPage('---\ntitle "unquoted"\n---\n# Hi\n\nThere');
  assert.notEqual(done.frontMatterError, null);
  assert.deepEqual(done.content.map((b) => b.content).join("|").includes("Hi"), true);
  assert.deepEqual(done.content.map((b) => b.content).join("|").includes("There"), true);
});

test("existing content lends ids by position when there is no overlay", () => {
  const withoutOverlay = write(page).replace(/^blocks: .*\n/m, "");
  assert.ok(!withoutOverlay.includes("blocks:"), "the overlay line is gone");
  const done = fileToPage(withoutOverlay, page);
  assert.deepEqual(done.content.map((b) => b.id), corpus.map((b) => b.id));
});

test("a folder page is front-matter only and reads back with empty content", () => {
  const folder: PageEntry = { _id: "f-1", workspaceId: "ws", title: "Folder", icon: "📁", surface: "folder" };
  const text = write(folder);
  assert.ok(text.startsWith("---\n"), "front-matter first");
  assert.ok(!text.includes("blocks"), "no overlay on a folder");
  const done = fileToPage(text, folder);
  assert.deepEqual(done.content, []);
  assert.deepEqual({ title: done.patch.title, icon: done.patch.icon }, { title: "Folder", icon: "📁" });
});

test("a code page stores its raw text; an empty one stores the empty string", () => {
  const source: PageEntry = {
    _id: "c-1", workspaceId: "ws", title: "main.ts", surface: "code",
    content: [{ id: "blk", type: "code", content: "const x = 1;\n", language: "ts" }],
  };
  assert.equal(write(source), "const x = 1;\n");
  assert.equal(write({ ...source, content: [] }), "");
  assert.equal(write({ ...source, content: undefined }), "");
});

test("markdown carries every MARKDOWN key (probed on the block type that owns it)", () => {
  const keyed = MARKDOWN_KEYS.filter((k) => !["id", "type", "content", "children"].includes(k));
  assert.deepEqual([...keyed].sort(), Object.keys(MARKDOWN_PROBES).sort());
  for (const key of keyed) {
    const { sent, back } = viaMarkdown(MARKDOWN_PROBES[key], key);
    assert.notEqual(sent, undefined, `${key}: the probe sends a value`);
    assert.deepEqual(back, sent, `markdown must carry ${key}`);
  }
});

test("markdown carries none of the OVERLAY keys (each probed, none equal on return)", () => {
  assert.deepEqual([...OVERLAY_KEYS].sort(), Object.keys(OVERLAY_PROBES).sort());
  for (const key of OVERLAY_KEYS) {
    const { sent, back } = viaMarkdown(OVERLAY_PROBES[key], key);
    assert.notEqual(sent, undefined, `${key}: the probe sends a value`);
    assert.notDeepEqual(back, sent, `markdown must not carry ${key}`);
  }
});

test("every OVERLAY key survives the file on its own block", () => {
  const blocks = OVERLAY_KEYS.map((key) => OVERLAY_PROBES[key].block);
  const done = fileToPage(pageToFile({ _id: "p", workspaceId: "w", content: blocks }));
  for (const key of OVERLAY_KEYS) {
    const index = blocks.findIndex((b) => b === OVERLAY_PROBES[key].block);
    assert.deepEqual(done.content[index]?.[key], blocks[index]?.[key], `${key} survives`);
  }
});

test("OVERLAY_KEYS is exactly the extra keys Markdown does not carry", () => {
  const expected = Object.keys(EXTRA_BLOCK_KEYS).filter((k) => !MARKDOWN_KEYS.includes(k)).sort();
  assert.deepEqual([...OVERLAY_KEYS].sort(), expected);
  for (const key of ["dueAt", "collapsed", "codeTheme", "fileName", "headingLevel", "tableConfig"]) {
    assert.ok(OVERLAY_KEYS.includes(key), `${key} rides the overlay`);
  }
  for (const key of ["color", "viewId", "recordLimit", "layoutConfig"]) {
    assert.ok(!OVERLAY_KEYS.includes(key), `${key} is markdown-carried`);
  }
});

test("every Block field is markdown, overlay or known-lossy (self-check)", () => {
  const names = blockFieldNames();
  assert.ok(names.length > 30, `parsed the Block fields, got ${names.length}`);
  for (const name of names) {
    const lists = [MARKDOWN_KEYS, OVERLAY_KEYS, KNOWN_LOSSY_KEYS].filter((l) => l.includes(name));
    assert.equal(lists.length, 1, `unclassified Block field: ${name}`);
  }
  assert.ok(names.includes("placeholderText"), "the known-lossy key is in Block");
  assert.deepEqual(KNOWN_LOSSY_KEYS, ["placeholderText"]);
});

test("the .omd name helpers", () => {
  assert.deepEqual(
    [isPageFileName("Roadmap.omd"), isPageFileName("_folder.omd"), isPageFileName("x.ts")],
    [true, true, false],
  );
  assert.deepEqual([isFolderMetaName("_folder.omd"), isFolderMetaName("Roadmap.omd")], [true, false]);
});
