/**
 * osionos#233 D233-9: every export that holds an uploaded file says, in one line, that uploads are
 * private osionos links; no export ever carries a signature; an export with no upload is unchanged.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { exportPageHtml } from "@/features/page-export/model/exportHtml";
import { exportPageMarkdown } from "@/features/page-export/model/exportMarkdown";
import { fileToPage, pageToFile } from "@/features/page-file/model/pageFileCodec";
import { PRIVATE_MEDIA_NOTE } from "@/shared/lib/media/exportMediaNote";
import { parseMarkdownClipboard, serializeSelectionToClipboard } from "@/services/page-actions/blockClipboardSerialize";
import { serializePageToMarkdown } from "@/services/page-actions";

const UPLOAD = `/api/media/uploads/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}.png`;
const SIGNED = `${UPLOAD}?exp=1795000000&kid=0a1b2c3d&sig=${"f".repeat(64)}`;
const withUpload: Block[] = [
  { id: "p1", type: "paragraph", content: `see [the file](${SIGNED})` } as Block,
  { id: "i1", type: "image", content: "", asset: `url:${SIGNED}` } as Block,
];
const withoutUpload: Block[] = [
  { id: "p2", type: "paragraph", content: "plain text" } as Block,
  { id: "i2", type: "image", content: "", asset: "url:https://images.example/x.png" } as Block,
];
const page = (content: Block[]) => ({ _id: "pg1", title: "Page", content, workspaceId: "ws" }) as unknown as PageEntry;

function assertSays(output: string, format: string) {
  assert.ok(output.includes(PRIVATE_MEDIA_NOTE), `${format} lacks the note`);
  assert.ok(output.includes(UPLOAD), `${format} lost the upload link`);
  assert.doesNotMatch(output, /sig=/, `${format} carries a signature`);
}
const assertSilent = (output: string, format: string) => assert.ok(!output.includes(PRIVATE_MEDIA_NOTE), `${format} adds the note with no upload`);

test("Markdown export: the note, no signature; no note without an upload", () => {
  assertSays(exportPageMarkdown("Page", withUpload, { content: "everything" }, () => null), "markdown");
  assertSilent(exportPageMarkdown("Page", withoutUpload, { content: "everything" }, () => null), "markdown");
});

test("HTML export: the note, no signature; no note without an upload", () => {
  assertSays(exportPageHtml("Page", withUpload, { content: "everything" }, () => null), "html");
  assertSilent(exportPageHtml("Page", withoutUpload, { content: "everything" }, () => null), "html");
});

test(".omd: the note in the front matter, no signature; it never reaches the page on import", () => {
  const file = pageToFile(page(withUpload));
  assertSays(file, ".omd");
  assertSilent(pageToFile(page(withoutUpload)), ".omd");
  const parsed = JSON.stringify(fileToPage(file, page(withUpload)));
  assert.ok(!parsed.includes(PRIVATE_MEDIA_NOTE), "the note was imported as content");
});

test("copy as markdown (blocks and whole page): the note, no signature anywhere on the clipboard", () => {
  const payload = serializeSelectionToClipboard(withUpload);
  assertSays(payload.markdown, "clipboard markdown");
  for (const flavour of [payload.text, payload.json]) assert.doesNotMatch(flavour, /sig=/);
  assertSilent(serializeSelectionToClipboard(withoutUpload).markdown, "clipboard markdown");
  assertSays(serializePageToMarkdown(page(withUpload)), "page markdown");
  assertSilent(serializePageToMarkdown(page(withoutUpload)), "page markdown");
});

test("pasting copied markdown back into a page drops the note, keeps the user's own quotes", () => {
  const pasted = JSON.stringify(parseMarkdownClipboard(serializeSelectionToClipboard(withUpload).markdown));
  assert.ok(!pasted.includes(PRIVATE_MEDIA_NOTE), "the note was pasted as a block");
  assert.ok(pasted.includes(UPLOAD), "the paste lost the upload");
  assert.match(JSON.stringify(parseMarkdownClipboard("> my own quote")), /my own quote/);
});
