// FF-10 (groot ADR 0067 RP8): the page-file path, not the bare parser, sees the engine bug
// fixed in markdown-engine a34736f. On e5253d2 the empty-paragraph and reference-definition
// pre-passes closed a fence on any line starting with ``` (so on "```c"): with
// keepEmptyParagraphs the code then gained a zero-width space and lost its "[x]: url" line.
// code-fence-roundtrip.test.ts parses without keepEmptyParagraphs and has no "[x]:" line.
//
// The fence-only line is "~~~", not "```": the page-file writer still emits a 3-backtick
// fence (pageMarkdownSerialize.ts, FF-7 (e)), so a ``` line in the body closes it on every
// engine and the page cannot round-trip until the long-fence writer returns (FF-17).

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";

const CODE = ["~~~", "", "", "```c", "int a;", "[x]: https://example.com"].join("\n");
const content: Block[] = [{ id: "ff10-code", type: "code", language: "md", content: CODE }];
const page: PageEntry = { _id: "ff10-page", workspaceId: "ws", title: "FF-10", content };

test("FF-10: a code block holding a fence line, a blank run, ```c and [x]: survives the page file", () => {
  assert.deepEqual(fileToPage(pageToFile(page)).content, content);
});
