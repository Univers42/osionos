// Markdown sugar for layout containers (ADR 0064 PS11–PS14). The writer emits only
// `:::columns` / `:::column`, with layout keys after the ratio; the readers (`.omd` file,
// raw mode) map `row | stack | grid | section` and `{k=v}` to style, and the markdown's
// attributes win over the overlay's layout keys. A file with no attributes (what live
// writes) keeps its overlay style whole.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { LAYOUT_STYLE_KEYS } from "../../src/entities/block/model/blockStyleAttributes.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { rawSourceToBlocks } from "../../src/features/raw-mode/model/rawSave.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import * as templates from "../../src/data/templates/index.ts";

const p = (id: string): Block => ({ id, type: "paragraph", content: id });
const column = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({ id, type: "column", content: "", ...extra, children });
const list = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({ id, type: "column_list", content: "", ...extra, children });
const pageOf = (content: Block[]): PageEntry => ({ _id: "sugar-1", workspaceId: "ws", title: "Sugar", content });

// What live (no attribute writer) puts on disk for the same page.
const liveWritten = (text: string): string => text.replace(/^(:::column[s]?(?: \S+)?) \{[^}\n]*\}$/gm, "$1");

const styled = (): Block[] => [
  list("L", [column("C1", [p("a")], { widthRatio: 0.5, style: { span: 2 } }), column("C2", [p("b")])], {
    style: { padding: 4, layout: "grid", cols: 3 },
  }),
];

function hasKeyDeep(blocks: readonly Block[], key: string): boolean {
  return blocks.some((block) => Object.hasOwn(block, key) || hasKeyDeep(block.children ?? [], key));
}

function layoutOf(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LAYOUT_STYLE_KEYS) {
    const value = (style as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function stripLayout(blocks: readonly Block[]): Block[] {
  return blocks.map((block) => {
    const copy: Block = { ...block };
    if (block.style !== undefined) copy.style = Object.fromEntries(Object.entries(block.style).filter(([key]) => !(LAYOUT_STYLE_KEYS as readonly string[]).includes(key)));
    if (block.children !== undefined) copy.children = stripLayout(block.children);
    return copy;
  });
}

test("the writer puts layout keys after the ratio and never writes a sugar kind", () => {
  assert.equal(
    serializeBlocksToMarkdown(styled()),
    ":::columns {layout=grid cols=3}\n:::column 0.5 {span=2}\na\n:::\n\n:::column\nb\n:::\n:::",
  );
  assert.doesNotMatch(pageToFile(pageOf(styled())), /^:::\s*(row|stack|grid|section)\b/m);
});

test("an unstyled or non-layout-styled column tree keeps its old bytes", () => {
  const old = ":::columns\n:::column 0.5\na\n:::\n\n:::column\nb\n:::\n:::";
  const plain = [list("L", [column("C1", [p("a")], { widthRatio: 0.5 }), column("C2", [p("b")])])];
  assert.equal(serializeBlocksToMarkdown(plain), old);
  assert.equal(serializeBlocksToMarkdown([list("L", plain[0].children ?? [], { style: { padding: 4, surface: "muted" } })]), old);
});

test("every template serialises as it did: only layout keys move bytes", () => {
  for (const [name, template] of Object.entries(templates)) {
    const page = template as unknown as PageEntry;
    const text = pageToFile(page);
    assert.doesNotMatch(text, /^:::column[s]?.*\{/m, name);
    assert.equal(text, pageToFile({ ...page, content: stripLayout(page.content ?? []) }), name);
  }
});

test("a styled page round-trips through its file byte for byte", () => {
  const text = pageToFile(pageOf(styled()));
  const parsed = fileToPage(text);
  assert.deepEqual(parsed.content, styled());
  assert.equal(pageToFile({ ...pageOf(styled()), content: parsed.content }), text);
  assert.equal(parsed.attributeDrops, undefined);
});

test("a live-written file (overlay only, no attributes) loses nothing", () => {
  const live = liveWritten(pageToFile(pageOf(styled())));
  assert.match(live, /^:::columns$/m);
  assert.match(live, /^:::column 0\.5$/m);
  assert.deepEqual(fileToPage(live).content, styled());
  const body = serializeBlocksToMarkdown(styled());
  assert.deepEqual(rawSourceToBlocks(liveWritten(body), styled()), styled());
});

test("attributes win over the overlay for layout keys; other keys keep the overlay", () => {
  const text = pageToFile(pageOf(styled())).replace(":::columns {layout=grid cols=3}", ":::columns {layout=row}");
  const [grid] = fileToPage(text).content;
  assert.deepEqual(grid.style, { padding: 4, layout: "row" });
  const raw = serializeBlocksToMarkdown(styled()).replace("{layout=grid cols=3}", "{layout=stack stackAt=never}");
  assert.deepEqual(rawSourceToBlocks(raw, styled())[0].style, { padding: 4, layout: "stack", stackAt: "never" });
});

test("sugar kinds read as a styled column list and write back as :::columns", () => {
  const source = "::: grid {cols=3 minCol=16}\n:::column\na\n:::\n:::column {span=2}\nb\n:::\n:::";
  const [grid] = rawSourceToBlocks(source, []);
  assert.equal(grid.type, "column_list");
  assert.deepEqual(grid.style, { cols: 3, minCol: 16, layout: "grid" });
  assert.deepEqual(grid.children?.map((child) => [child.type, child.style]), [["column", undefined], ["column", { span: 2 }]]);
  assert.match(serializeBlocksToMarkdown([grid]), /^:::columns \{layout=grid cols=3 minCol=16\}\n:::column\n/);
  const [section] = rawSourceToBlocks("::: section {surface=muted}\ntext\n:::", []);
  assert.deepEqual([section.type, section.style, section.children?.map((child) => child.type)], ["column_list", { surface: "muted" }, ["column"]]);
});

test("re-reading a page's own body keeps its unchanged blocks by reference", () => {
  const content = [p("intro"), list("L", [column("C1", [p("a")], { widthRatio: 0.5 }), column("C2", [p("b")])])];
  const parsed = fileToPage(serializeBlocksToMarkdown(content, { keepEmptyParagraphs: true }), pageOf(content)).content;
  assert.equal(parsed[0], content[0]);
  assert.equal(parsed[1], content[1]);
});

test("invalid attributes are dropped and reported, never thrown", () => {
  const parsed = fileToPage(":::columns {cols=99 bogus=1 a layout=grid}\n:::column\nx\n:::\n:::");
  const [grid] = parsed.content;
  assert.deepEqual(grid.style, { layout: "grid" });
  assert.deepEqual(parsed.attributeDrops, [
    { blockId: grid.id, reason: "malformed" },
    { blockId: grid.id, key: "bogus", reason: "unknown" },
    { blockId: grid.id, key: "cols", reason: "value" },
  ]);
});

test("prototype names in attributes stay inert", () => {
  const source = ":::columns {constructor=1 toString=grid hasOwnProperty=2 __proto__=x}\n:::column\nx\n:::\n:::";
  for (const blocks of [fileToPage(source).content, rawSourceToBlocks(source, [])]) {
    assert.equal(Object.hasOwn(blocks[0], "style"), false);
    assert.equal(hasKeyDeep(blocks, "containerAttributes"), false);
  }
  assert.equal(({} as Record<string, unknown>).cols, undefined);
  assert.equal(Object.prototype.toString.call({}), "[object Object]");
});

test("old :::columns parse as before, with no style and no engine field", () => {
  const blocks = rawSourceToBlocks(":::columns\n:::column 0.25\na\n:::\n\n:::column 0.75\nb\n:::\n:::", []);
  assert.deepEqual(blocks.map((block) => [block.type, block.children?.map((child) => [child.type, child.widthRatio, child.children?.[0].content])]), [
    ["column_list", [["column", 0.25, "a"], ["column", 0.75, "b"]]],
  ]);
  assert.equal(hasKeyDeep(blocks, "style"), false);
  assert.equal(hasKeyDeep(blocks, "containerAttributes"), false);
});

test("a 1 MB attribute line reads in under 50 ms on both readers", () => {
  const huge = `:::columns {${"cols=3 ".repeat(149_796)}}\n:::column\na\n:::\n:::`;
  assert.ok(huge.length > 1_048_576);
  fileToPage(":::columns {cols=3}\n:::");
  for (const read of [() => fileToPage(huge).content, () => rawSourceToBlocks(huge, [])]) {
    const started = performance.now();
    const [grid] = read();
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 50, `${elapsed.toFixed(1)} ms`);
    assert.deepEqual(grid.style, { cols: 3 });
  }
});

// mulberry32, as in block-style.test.ts: the same rounds on every run.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIST_CHOICES: Record<string, readonly unknown[]> = {
  layout: ["row", "stack", "grid"], wrap: ["nowrap", "wrap"], cols: [1, 2, 3, 4, 5, 6],
  minCol: [10, 12, 16, 20], stackAt: ["tablet", "mobile", "never"], padding: [0, 4, 12], surface: ["muted", "accent"],
};
const COLUMN_CHOICES: Record<string, readonly unknown[]> = { span: [1, 2, 3, 6], padding: [2, 8], radius: ["md"] };

function randomTree(rand: () => number, depth: number, next: () => string): Block[] {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const styleOf = (choices: Record<string, readonly unknown[]>): Partial<Block> => {
    const style = Object.fromEntries(Object.entries(choices).filter(() => rand() < 0.4).map(([key, values]) => [key, pick(values)]));
    return Object.keys(style).length > 0 ? { style } : {};
  };
  const columns = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
    const children = depth > 0 && rand() < 0.3 ? randomTree(rand, depth - 1, next) : [p(next())];
    const ratio = pick([undefined, 0.25, 0.5, 0.75]);
    return column(next(), children, { ...(ratio === undefined ? {} : { widthRatio: ratio }), ...styleOf(COLUMN_CHOICES) });
  });
  return [p(next()), list(next(), columns, styleOf(LIST_CHOICES))];
}

function collectLayouts(blocks: readonly Block[], out: unknown[] = []): unknown[] {
  for (const block of blocks) {
    if (block.type === "column_list" || block.type === "column") out.push(layoutOf(block.style));
    collectLayouts(block.children ?? [], out);
  }
  return out;
}

test("seeded random styled trees round-trip through file, raw mode and live's writer", () => {
  const rand = seeded(0x1a7e);
  for (let round = 0; round < 400; round++) {
    let counter = 0;
    const content = randomTree(rand, 2, () => `b${round}-${counter++}`);
    const text = pageToFile(pageOf(content));
    assert.deepEqual(fileToPage(text).content, content, `file round ${round}`);
    assert.equal(pageToFile(pageOf(fileToPage(text).content)), text, `bytes round ${round}`);
    assert.deepEqual(fileToPage(liveWritten(text)).content, content, `live round ${round}`);
    assert.deepEqual(rawSourceToBlocks(serializeBlocksToMarkdown(content), content), content, `raw round ${round}`);
    const body = serializeBlocksToMarkdown(content, { keepEmptyParagraphs: true });
    assert.deepEqual(collectLayouts(fileToPage(body).content), collectLayouts(content), `markdown only round ${round}`);
  }
});
