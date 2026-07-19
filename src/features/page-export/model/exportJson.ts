/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportJson.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// JSON export, two shapes on the styling axis. RAW is the stored block tree
// verbatim under a { title, content } envelope — the exact shape
// importPageFile() accepts, so a raw export re-imports losslessly — and costs
// exactly one JSON.stringify. CLEAN is a portable outline: internal ids and
// editor-only fields dropped, the inline bracket dialect corrected to
// standard markdown, databases resolved to columns+rows through the same
// source as the CSV export.

import type { Block } from "@/entities/block";
import { isDatabaseBlock } from "./databaseExportSource";
import { inlineToMarkdown } from "./inlineDialect";
import type { ExportDatabase, ExportOptions } from "./exportTypes";

const MEDIA_TYPES = new Set(["image", "video", "audio", "file"]);

export interface CleanBlock {
  type: string;
  text?: string;
  checked?: boolean;
  language?: string;
  src?: string;
  title?: string;
  columns?: string[];
  rows?: string[][];
  children?: CleanBlock[];
}

const stamp = () => new Date().toISOString();

/** Lossless page JSON: the stored tree verbatim (fast path, re-importable). */
export function rawPageJson(title: string, blocks: Block[]): string {
  return JSON.stringify(
    { schema: "osionos.page.raw.v1", exportedAt: stamp(), title, content: blocks },
    null,
    2,
  );
}

function cleanBlocks(
  blocks: Block[],
  options: Pick<ExportOptions, "content">,
  resolveDatabase: (block: Block) => ExportDatabase | null,
): CleanBlock[] {
  const excludeFiles = options.content === "no_files";
  const out: CleanBlock[] = [];
  for (const block of blocks) {
    if (MEDIA_TYPES.has(block.type)) {
      if (excludeFiles) continue;
      const src = (block.content ?? "").replace(/^url:/, "");
      if (src) out.push({ type: block.type, src });
      continue;
    }
    if (isDatabaseBlock(block)) {
      const db = resolveDatabase(block);
      if (db) out.push({ type: "database", title: db.title, columns: db.columns, rows: db.rows });
      continue;
    }
    const entry: CleanBlock = { type: block.type };
    if (block.type === "table_block") {
      entry.rows = block.tableData ?? [];
    } else if (block.type === "code" || block.type === "equation") {
      entry.text = block.content ?? "";
      if (typeof block.language === "string" && block.language) entry.language = block.language;
    } else {
      const text = inlineToMarkdown(block.content ?? "");
      if (text) entry.text = text;
    }
    if (block.type === "to_do") entry.checked = Boolean(block.checked);
    if (block.children?.length) {
      entry.children = cleanBlocks(block.children, options, resolveDatabase);
    }
    out.push(entry);
  }
  return out;
}

/** Portable page JSON: corrected inline text, no editor internals. */
export function cleanPageJson(
  title: string,
  blocks: Block[],
  options: Pick<ExportOptions, "content">,
  resolveDatabase: (block: Block) => ExportDatabase | null,
): string {
  return JSON.stringify(
    {
      schema: "osionos.page.clean.v1",
      exportedAt: stamp(),
      title,
      blocks: cleanBlocks(blocks, options, resolveDatabase),
    },
    null,
    2,
  );
}
