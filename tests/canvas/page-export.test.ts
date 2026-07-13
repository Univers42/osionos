/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-export.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { crc32, buildZip } from "../../src/features/page-export/model/zipWriter.ts";
import { toCsv } from "../../src/features/page-export/model/exportCsv.ts";
import {
  sanitizeFileName,
  createNameAllocator,
  pageDirectory,
} from "../../src/features/page-export/model/exportPaths.ts";
import {
  transformBlocksForExport,
  exportPageMarkdown,
} from "../../src/features/page-export/model/exportMarkdown.ts";
import {
  renderInline,
  renderBlocksHtml,
  exportPageHtml,
  databaseTableHtml,
} from "../../src/features/page-export/model/exportHtml.ts";
import {
  resolveDatabaseExport,
  stringifyPropertyValue,
} from "../../src/features/page-export/model/databaseExportSource.ts";

const block = (partial: Partial<Block> & { type: Block["type"] }): Block =>
  ({ id: `b-${Math.random().toString(36).slice(2)}`, content: "", ...partial }) as Block;

/* ── zip ─────────────────────────────────────────────────────────────── */

test("crc32 matches the reference vector", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("buildZip emits a valid STORE archive (local header, central dir, EOCD)", () => {
  const bytes = buildZip([
    { path: "A.md", bytes: new TextEncoder().encode("# A\n") },
    { path: "A/B.md", bytes: new TextEncoder().encode("# B\n") },
  ]);
  const sig = (offset: number) =>
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24);
  assert.equal(sig(0) >>> 0, 0x04034b50, "local file header signature");
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.includes("A.md") && text.includes("A/B.md"), "entry names present");
  // EOCD: last 22 bytes (no comment) — entry count = 2.
  const eocd = bytes.length - 22;
  assert.equal(sig(eocd) >>> 0, 0x06054b50, "EOCD signature");
  assert.equal(bytes[eocd + 10]! | (bytes[eocd + 11]! << 8), 2, "central entry count");
});

/* ── csv ─────────────────────────────────────────────────────────────── */

test("toCsv quotes commas, quotes and newlines per RFC 4180", () => {
  const csv = toCsv(["Name", "Notes"], [
    ["plain", "a,b"],
    ['say "hi"', "line1\nline2"],
  ]);
  assert.equal(
    csv,
    'Name,Notes\r\nplain,"a,b"\r\n"say ""hi""","line1\nline2"\r\n',
  );
});

/* ── paths ───────────────────────────────────────────────────────────── */

test("sanitizeFileName strips separators and never returns empty", () => {
  assert.equal(sanitizeFileName("A/B\\C:D*E?F\"G<H>I|J"), "A-B-C-D-E-F-G-H-I-J");
  assert.equal(sanitizeFileName("   "), "Untitled");
});

test("name allocator dedupes per directory; pageDirectory builds chains", () => {
  const allocate = createNameAllocator();
  assert.equal(allocate("", "Page", ".md"), "Page.md");
  assert.equal(allocate("", "Page", ".md"), "Page (1).md");
  assert.equal(allocate("Page", "Page", ".md"), "Page/Page.md");
  assert.equal(pageDirectory(["Root", "Sub/Child"], true), "Root/Sub-Child");
  assert.equal(pageDirectory(["Root"], false), "");
});

/* ── markdown ────────────────────────────────────────────────────────── */

const RICH_BLOCKS: Block[] = [
  block({ type: "heading_1", content: "Intro" }),
  block({ type: "paragraph", content: "Hello **world**" }),
  block({ type: "image", content: "https://example.com/pic.png" }),
  block({ type: "file", content: "url:https://example.com/doc.pdf" }),
  block({ type: "database_inline", content: "", databaseId: "db1" } as Partial<Block> as Block),
  block({ type: "to_do", content: "Ship it", checked: true } as Partial<Block> as Block),
];

test("markdown export renders media, honors exclude-files, links databases", () => {
  const everything = exportPageMarkdown("My Page", RICH_BLOCKS, { content: "everything" },
    () => "[Tasks](Tasks.csv)");
  assert.ok(everything.startsWith("# My Page\n"));
  assert.ok(everything.includes("![](https://example.com/pic.png)"), "image line");
  assert.ok(everything.includes("[file](https://example.com/doc.pdf)"), "file link un-prefixed");
  assert.ok(everything.includes("[Tasks](Tasks.csv)"), "database reference");
  assert.ok(everything.includes("- [x] Ship it"), "todo state");

  const stripped = exportPageMarkdown("My Page", RICH_BLOCKS, { content: "no_files" }, () => null);
  assert.ok(!stripped.includes("example.com"), "no media URLs when excluded");
  assert.ok(stripped.includes("Hello **world**"), "text survives");
});

test("transform clones — the source tree is never mutated", () => {
  const source = [block({ type: "toggle", content: "T", children: [block({ type: "image", content: "x.png" })] })];
  const out = transformBlocksForExport(source, { content: "no_files" }, () => null);
  assert.equal(source[0]!.children!.length, 1, "source untouched");
  assert.equal(out[0]!.children!.length, 0, "clone filtered");
});

/* ── html ────────────────────────────────────────────────────────────── */

test("renderInline maps marks to tags and escapes html", () => {
  const html = renderInline("**bold** *it* `code` [x](https://x.dev) <img>");
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes("<em>it</em>"));
  assert.ok(html.includes("<code>code</code>"));
  assert.ok(html.includes('<a href="https://x.dev">x</a>'));
  assert.ok(html.includes("&lt;img&gt;"), "raw html escaped");
});

test("html export renders structure, escapes code, excludes media on demand", () => {
  const doc = exportPageHtml("Pa<ge>", RICH_BLOCKS, { content: "everything" },
    () => databaseTableHtml("Tasks", ["Name"], [["Row1"]]));
  assert.ok(doc.includes("<title>Pa&lt;ge&gt;</title>"), "title escaped");
  assert.ok(doc.includes("<h2>Intro</h2>"), "heading level shifted under page H1");
  assert.ok(doc.includes('<img src="https://example.com/pic.png"'));
  assert.ok(doc.includes("<th>Name</th>") && doc.includes("<td>Row1</td>"), "db table inline");
  assert.ok(doc.includes("checked"), "todo checked");

  const stripped = renderBlocksHtml(RICH_BLOCKS, { content: "no_files" }, () => null);
  assert.ok(!stripped.includes("<img") && !stripped.includes("doc.pdf"));
});

test("html lists group consecutive items into one ul/ol", () => {
  const html = renderBlocksHtml([
    block({ type: "bulleted_list", content: "a" }),
    block({ type: "bulleted_list", content: "b" }),
    block({ type: "numbered_list", content: "c" }),
  ], { content: "everything" }, () => null);
  assert.equal((html.match(/<ul>/g) ?? []).length, 1);
  assert.equal((html.match(/<ol>/g) ?? []).length, 1);
});

/* ── database resolution: current vs default view ────────────────────── */

const DB_STATE = {
  databases: {
    db1: {
      id: "db1", name: "Tasks", titlePropertyId: "p_title",
      properties: {
        p_title: { id: "p_title", name: "Name", type: "title" },
        p_status: { id: "p_status", name: "Status", type: "select" },
        p_secret: { id: "p_secret", name: "Secret", type: "text" },
      },
    },
  },
  pages: {
    r1: { id: "r1", databaseId: "db1", properties: { p_title: "Beta", p_status: "Doing", p_secret: "s1" } },
    r2: { id: "r2", databaseId: "db1", properties: { p_title: "Alpha", p_status: "Done", p_secret: "s2" } },
    r3: { id: "r3", databaseId: "db1", archived: true, properties: { p_title: "Gone" } },
  },
  views: {
    v_default: {
      id: "v_default", databaseId: "db1", name: "All", type: "table",
      filters: [], filterConjunction: "and", sorts: [],
      visibleProperties: ["p_title", "p_status", "p_secret"], settings: {},
    },
    v_board: {
      id: "v_board", databaseId: "db1", name: "Board", type: "board",
      filters: [], filterConjunction: "and",
      sorts: [{ id: "s1", propertyId: "p_title", direction: "asc" }],
      visibleProperties: ["p_title", "p_status"], settings: {},
    },
  },
  // Deliberately loose: the runtime state store is validated by its own package.
} as unknown as Parameters<typeof resolveDatabaseExport>[0];

test("current view uses the block's view (columns + sort); default uses the first", () => {
  const dbBlock = block({ type: "database_inline", databaseId: "db1", viewId: "v_board" } as Partial<Block> as Block);

  const current = resolveDatabaseExport(DB_STATE, dbBlock, "current")!;
  assert.deepEqual(current.columns, ["Name", "Status"], "board view hides Secret");
  assert.deepEqual(current.rows.map((row) => row[0]), ["Alpha", "Beta"], "board sort applied");

  const fallback = resolveDatabaseExport(DB_STATE, dbBlock, "default")!;
  assert.deepEqual(fallback.columns, ["Name", "Status", "Secret"], "default = first view");
  assert.equal(fallback.rows.length, 2, "archived rows excluded");
});

test("stringifyPropertyValue flattens arrays and labeled objects", () => {
  assert.equal(stringifyPropertyValue(["a", { name: "b" }] as never), "a, b");
  assert.equal(stringifyPropertyValue(42 as never), "42");
  assert.equal(stringifyPropertyValue(undefined), "");
});

/* ── full pipeline: buildExportFiles matrix ──────────────────────────── */

import { buildExportFiles } from "../../src/features/page-export/model/buildExportFiles.ts";
import type { ExportOptions, ExportPageNode } from "../../src/features/page-export/model/exportTypes.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const PAGES: ExportPageNode[] = [
  { id: "root", title: "Root Page", blocks: RICH_BLOCKS, chain: [] },
  { id: "child", title: "Child", blocks: [block({ type: "paragraph", content: "child body" })], chain: ["Root Page"] },
  { id: "grand", title: "Child", blocks: [], chain: ["Root Page", "Child"] },
];
const OPTS = (over: Partial<ExportOptions>): ExportOptions => ({
  format: "markdown", dbViews: "current", content: "everything",
  includeSubpages: true, createFolders: true, ...over,
});

test("md+csv export with folders: pages nest, database emits a linked csv", async () => {
  const files = await buildExportFiles({ pages: PAGES, options: OPTS({}), dbState: DB_STATE });
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, [
    "Root Page - Tasks.csv",
    "Root Page.md",
    "Root Page/Child.md",
    "Root Page/Child/Child.md",
  ]);
  const rootMd = text(files[1]!.bytes);
  assert.ok(rootMd.includes("[Tasks](Root%20Page%20-%20Tasks.csv)"), "md links the csv");
  const csv = text(files[0]!.bytes);
  assert.ok(csv.startsWith("Name,Status"), "csv honors the block's current view");
  assert.ok(csv.includes("Alpha,Done"), "csv rows present");
});

test("flat export (no folders) dedupes colliding names at the root", async () => {
  const files = await buildExportFiles({
    pages: PAGES, options: OPTS({ createFolders: false }), dbState: null,
  });
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, ["Root Page.md", "Child.md", "Child (1).md"]);
  assert.ok(!text(files[0]!.bytes).includes("Tasks.csv"), "no db state → no csv link");
});

test("html export inlines the database table in one standalone file", async () => {
  const files = await buildExportFiles({
    pages: [PAGES[0]!], options: OPTS({ format: "html", includeSubpages: false }), dbState: DB_STATE,
  });
  assert.equal(files.length, 1);
  const html = text(files[0]!.bytes);
  assert.ok(html.includes("<th>Name</th>") && html.includes("<td>Doing</td>"), "db table inline");
  assert.ok(html.includes("<!DOCTYPE html>"));
});

test("pdf export produces real PDF bytes for every page", async () => {
  const files = await buildExportFiles({
    pages: PAGES.slice(0, 2), options: OPTS({ format: "pdf" }), dbState: DB_STATE,
  });
  assert.equal(files.length, 2);
  for (const file of files) {
    assert.equal(text(file.bytes.slice(0, 5)), "%PDF-", `${file.path} magic bytes`);
    assert.ok(file.bytes.length > 800, `${file.path} has body`);
  }
  assert.ok(files[0]!.path.endsWith("Root Page.pdf"));
});

/* ── editor inline dialect translation ───────────────────────────────── */

test("editor bracket dialect → markdown / html / plain", async () => {
  const { inlineToMarkdown, inlineTagsToHtml, stripInlineTags } =
    await import("../../src/features/page-export/model/inlineDialect.ts");
  assert.equal(
    inlineToMarkdown("a [b]x[/b] [i]y[/i] [s]z[/s] [u]w[/u] [color=red]c[/color]"),
    "a **x** *y* ~~z~~ w c",
  );
  assert.equal(inlineToMarkdown("[b][i]both[/i][/b]"), "***both***");
  assert.equal(inlineToMarkdown("[b]outer [i]inner[/i][/b]"), "**outer *inner***");
  assert.ok(inlineTagsToHtml("[b]x[/b]").includes("<strong>x</strong>"));
  assert.ok(inlineTagsToHtml("[u]y[/u]").includes("<u>y</u>"));
  assert.ok(inlineTagsToHtml("[mark]m[/mark]").includes("<mark>m</mark>"));
  assert.equal(stripInlineTags("[b][i]n[/i][/b] [bg=x]t[/bg]"), "n t");
});

test("markdown export translates stored bracket marks", () => {
  const md = exportPageMarkdown("T", [block({ type: "paragraph", content: "hello [b]bold[/b]" })],
    { content: "everything" }, () => null);
  assert.ok(md.includes("hello **bold**"), md);
});
