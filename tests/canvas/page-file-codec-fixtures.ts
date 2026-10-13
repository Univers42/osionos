/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-codec-fixtures.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { readFileSync } from "node:fs";

import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

let seq = 0;
export const mk = (block: Partial<Block> & { type: Block["type"] }): Block => ({
  id: `b${seq++}`,
  content: "",
  ...block,
});

/** A block carrying a key, plus where the key reads back after a Markdown round trip. */
export interface Probe {
  block: Block;
  pick: (parsed: Block[]) => unknown;
}

const first = (key: string) => (parsed: Block[]): unknown => parsed[0]?.[key];
const probe = (block: Block, key: string): Probe => ({ block, pick: first(key) });
const cell = { id: "c1", colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1, blocks: [] };
const column = mk({ type: "column", widthRatio: 0.4 });

/** One block per MARKDOWN key, on the type that owns it. */
export const MARKDOWN_PROBES: Record<string, Probe> = {
  checked: probe(mk({ type: "to_do", content: "t", checked: true }), "checked"),
  language: probe(mk({ type: "code", content: "x", language: "ts" }), "language"),
  asset: probe(mk({ type: "image", asset: "https://a.io/x.png" }), "asset"),
  mediaAlt: probe(mk({ type: "image", asset: "https://a.io/x.png", mediaAlt: "alt" }), "mediaAlt"),
  widthRatio: {
    block: mk({ type: "column_list", children: [column] }),
    pick: (parsed) => parsed[0]?.children?.[0]?.widthRatio,
  },
  color: probe(mk({ type: "callout", content: "c", color: "⚠️" }), "color"),
  drawHeight: probe(mk({ type: "draw", content: '{"a":1}', drawHeight: 512 }), "drawHeight"),
  buttonLabel: probe(mk({ type: "button", buttonLabel: "Go" }), "buttonLabel"),
  buttonHref: probe(mk({ type: "button", buttonHref: "page://abc" }), "buttonHref"),
  buttonVariant: probe(mk({ type: "button", buttonVariant: "secondary" }), "buttonVariant"),
  tableData: probe(mk({ type: "table_block", tableData: [["A", "B", "C"], ["1", "2", "3"]] }), "tableData"),
  databaseId: probe(mk({ type: "database_inline", databaseId: "db1" }), "databaseId"),
  viewId: probe(mk({ type: "database_inline", databaseId: "db1", viewId: "v2" }), "viewId"),
  recordLimit: probe(mk({ type: "database_inline", databaseId: "db1", recordLimit: 25 }), "recordLimit"),
  layoutMode: probe(mk({ type: "layout", layoutMode: "inline" }), "layoutMode"),
  layoutRole: probe(mk({ type: "layout", layoutRole: "header" }), "layoutRole"),
  layoutConfig: probe(mk({ type: "layout", layoutConfig: { columns: 2 } }), "layoutConfig"),
  layoutCells: probe(mk({ type: "layout", layoutCells: [cell] }), "layoutCells"),
  schemaVersion: probe(mk({ type: "layout", schemaVersion: 2 }), "schemaVersion"),
};

/** One block per OVERLAY key; Markdown must hand back something else (usually nothing). */
export const OVERLAY_PROBES: Record<string, Probe> = {
  dueAt: probe(mk({ type: "to_do", content: "t", dueAt: "2026-10-13" }), "dueAt"),
  codeView: probe(mk({ type: "code", content: "x", codeView: "source" }), "codeView"),
  codeTheme: probe(mk({ type: "code", content: "x", codeTheme: "light" }), "codeTheme"),
  lineNumbers: probe(mk({ type: "code", content: "x", lineNumbers: true }), "lineNumbers"),
  fileName: probe(mk({ type: "code", content: "x", fileName: "main.ts" }), "fileName"),
  sqlMountId: probe(mk({ type: "code", content: "x", sqlMountId: "m1" }), "sqlMountId"),
  heightLines: probe(mk({ type: "code", content: "x", heightLines: 12 }), "heightLines"),
  textColor: probe(mk({ type: "paragraph", content: "p", textColor: "#111" }), "textColor"),
  backgroundColor: probe(mk({ type: "paragraph", content: "p", backgroundColor: "#222" }), "backgroundColor"),
  collapsed: probe(mk({ type: "toggle", content: "t", collapsed: true }), "collapsed"),
  mediaWidth: probe(mk({ type: "image", asset: "a", mediaWidth: 50 }), "mediaWidth"),
  mediaShape: probe(mk({ type: "image", asset: "a", mediaShape: "circle" }), "mediaShape"),
  mediaAspect: probe(mk({ type: "image", asset: "a", mediaAspect: "16 / 9" }), "mediaAspect"),
  deferMount: probe(mk({ type: "home_views", deferMount: true }), "deferMount"),
  collectionRef: probe(mk({ type: "paragraph", content: "p", collectionRef: "members" }), "collectionRef"),
  recordRef: probe(mk({ type: "paragraph", content: "p", recordRef: "$record" }), "recordRef"),
  fieldBind: probe(mk({ type: "paragraph", content: "p", fieldBind: "headline" }), "fieldBind"),
  headingLevel: probe(mk({ type: "callout", content: "c", headingLevel: 3 }), "headingLevel"),
  tableConfig: probe(
    mk({ type: "table_block", tableData: [["A", "B", "C"], ["1", "2", "3"]], tableConfig: { columnWidths: [120, 80, 80] } }),
    "tableConfig",
  ),
};

/** Everything Markdown or the overlay carries, on the types that own it. */
export const corpus: Block[] = [
  mk({ type: "paragraph", content: "Plain text" }),
  mk({ type: "heading_3", content: "Third level" }),
  mk({ type: "heading_6", content: "Sixth level" }),
  mk({ type: "quote", content: "Quoted", headingLevel: 2 }),
  mk({ type: "toggle", content: "Outer toggle", collapsed: true, headingLevel: 2, children: [
    mk({ type: "paragraph", content: "Inside" }),
    mk({ type: "bulleted_list", content: "Item" }),
  ] }),
  mk({ type: "bulleted_list", content: "Parent", children: [mk({ type: "bulleted_list", content: "Nested" })] }),
  mk({ type: "numbered_list", content: "Number" }),
  mk({ type: "to_do", content: "Todo done", checked: true, dueAt: "2026-10-13" }),
  mk({ type: "callout", content: "Heads up", color: "⚠️", headingLevel: 3 }),
  mk({ type: "code", content: "const a = 1;", language: "ts", fileName: "main.ts", codeTheme: "light", lineNumbers: true }),
  mk({ type: "equation", content: "E = mc^2" }),
  mk({ type: "divider" }),
  mk({ type: "paragraph", content: "Coloured", textColor: "#ff0000", backgroundColor: "#00ff00" }),
  mk({ type: "table_block", tableData: [["A", "B", "C"], ["1", "2", "3"]], tableConfig: { columnAlignments: ["left", "right", "center"], columnWidths: [100, 200, 90] } }),
  mk({ type: "image", asset: "https://a.io/x.png", mediaAlt: "An x", content: "The caption", mediaWidth: 50 }),
  mk({ type: "video", asset: "https://a.io/v.mp4", content: "Clip" }),
  mk({ type: "audio", asset: "https://a.io/a.mp3" }),
  mk({ type: "file", asset: "https://a.io/f.pdf", fileName: "spec.pdf", content: "spec.pdf" }),
  mk({ type: "button", buttonLabel: "Go", buttonHref: "page://abc", buttonVariant: "secondary" }),
  mk({ type: "draw", content: '{"strokes":[1,2]}', drawHeight: 512 }),
  mk({ type: "database_inline", databaseId: "db1", viewId: "v2", recordLimit: 25 }),
  mk({ type: "database_full_page", databaseId: "db9" }),
  mk({ type: "graph_view" }),
  mk({ type: "home_views" }),
  mk({ type: "column_list", children: [
    mk({ type: "column", widthRatio: 0.4, children: [mk({ type: "paragraph", content: "Left cell" })] }),
    mk({ type: "column", widthRatio: 0.6, children: [mk({ type: "heading_2", content: "Right title" })] }),
  ] }),
];

export const page: PageEntry = { _id: "page-1", workspaceId: "ws-1", title: "Corpus", content: corpus };

/** Every front-matter field set, so the patch test proves each one comes back. */
export const META_PAGE: PageEntry = {
  _id: "p-meta", workspaceId: "ws", title: "Meta", icon: "📄", cover: "https://c.io/x.png",
  coverPosition: 25, surface: "wiki", visibility: "shared", databaseId: "db-9",
  isTemplate: true, isDefaultTemplate: true, templateSurface: "marketplace-app",
  recurrence: { every: "week", nextDueAt: "2026-11-01" }, updatedAt: "2026-10-01T00:00:00.000Z",
  properties: [{ key: "Status", label: "Status", type: "select", value: "Live" }],
};

/** Serialize → parse one probe block; the value sent and the value that came back. */
export function viaMarkdown(entry: Probe, key: string): { sent: unknown; back: unknown } {
  const parsed = parseMarkdownToBlocks(serializeBlocksToMarkdown([entry.block]));
  return { sent: entry.block[key] ?? entry.block.children?.[0]?.[key], back: entry.pick(parsed) };
}

/** Splice a paragraph in as the first block of an `.omd` body. */
export function insertAtTop(text: string, paragraph: string): string {
  const fence = text.indexOf("\n---\n", 4) + 5;
  const lead = text.startsWith("\n", fence) ? fence + 1 : fence;
  return `${text.slice(0, lead)}${paragraph}\n\n${text.slice(lead)}`;
}

/** Block's own declared fields — the self-check must cover every one of them. */
export function blockFieldNames(): string[] {
  const url = new URL("../../src/entities/block/model/types.ts", import.meta.url);
  const text = readFileSync(url, "utf8");
  const start = text.indexOf("export interface Block {");
  const body = text.slice(start, text.indexOf("\n}", start));
  // Ponytail: this regex reads only `interface Block`'s own lines, so a field
  // added through an intersection type or a second interface is not seen.
  return [...body.matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)].map((match) => match[1]);
}

