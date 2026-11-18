import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import type { Block } from "../../src/entities/block/model/types.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";

const README = readFileSync(new URL("../fixtures/profile/github-readme.md", import.meta.url), "utf8");

function codeRoundTrip(content: string, language = "markdown"): Block[] {
  const block: Block = { id: "code-1", type: "code", content, language };
  return parseMarkdownToBlocks(serializeBlocksToMarkdown([block]));
}

test("a README that carries its own fences round-trips as one code block", () => {
  const blocks = codeRoundTrip(README);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, "code");
  assert.equal(blocks[0]?.language, "markdown");
  assert.equal(blocks[0]?.content, README);
});

test("code without a 3+ backtick run keeps the 3-backtick fence byte for byte", () => {
  const block: Block = { id: "c", type: "code", content: "a `b` ``c``\nd", language: "ts" };
  assert.equal(serializeBlocksToMarkdown([block]), "```ts\na `b` ``c``\nd\n```");
});

// mulberry32: a seeded generator, so a failure replays from the printed seed.
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = ["", "a", "code", " ", "  x", "{}", "$$", "~~~", "---", "# h"];

function randomLine(next: () => number): string {
  const run = "`".repeat(Math.floor(next() * 9));
  const pick = () => PIECES[Math.floor(next() * PIECES.length)] ?? "";
  return next() < 0.5 ? `${run}${pick()}` : `${pick()}${run}${pick()}`;
}

function randomContent(next: () => number): string {
  const lineCount = Math.floor(next() * 7);
  const lines = Array.from({ length: lineCount }, () => randomLine(next));
  const eol = next() < 0.25 ? "\r\n" : "\n";
  return lines.join(eol) + (next() < 0.3 ? eol : "");
}

const SEED = 20261117;
const RUNS = 2000;

test(`property: random backtick content round-trips (seed ${SEED}, ${RUNS} runs)`, () => {
  const next = seeded(SEED);
  const failures: string[] = [];
  for (let run = 0; run < RUNS; run++) {
    const content = randomContent(next);
    const blocks = codeRoundTrip(content, "");
    if (blocks.length !== 1 || blocks[0]?.type !== "code" || blocks[0].content !== content) {
      failures.push(JSON.stringify(content));
    }
  }
  assert.deepEqual(failures.slice(0, 3), [], `${failures.length}/${RUNS} failed`);
});

for (const [name, content] of [
  ["empty body", ""],
  ["only backticks", "``````"],
  ["only a 3-run", "```"],
  ["trailing newline", "```\nx\n"],
  ["CRLF", "a\r\n```\r\nb"],
] as const) {
  test(`fixed case: ${name}`, () => {
    const blocks = codeRoundTrip(content, "");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.content, content);
  });
}

test("parser: a fence closes only on a fence at least as long as its opener", () => {
  const blocks = parseMarkdownToBlocks("````md\n```\n\n\n\nx\n```\n````\n\nafter");
  assert.equal(blocks[0]?.type, "code");
  assert.equal(blocks[0]?.content, "```\n\n\n\nx\n```");
  assert.equal(blocks.at(-1)?.content, "after");
});

test("U4b-5 a markdown preview block holding the fenced README survives the page file byte for byte", () => {
  const block: Block = { id: "readme", type: "code", content: README, language: "markdown", codeView: "preview" };
  const page = { _id: "p", workspaceId: "w", title: "README", content: [block] };
  const back = fileToPage(pageToFile(page as never)).content;
  assert.equal(back.length, 1);
  assert.equal(back[0]?.type, "code");
  assert.equal(back[0]?.content, README);
  assert.equal(back[0]?.codeView, "preview");
});
