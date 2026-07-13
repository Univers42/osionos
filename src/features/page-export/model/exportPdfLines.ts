/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportPdfLines.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure block-tree → styled-line flattening for the PDF renderer. No pdf-lib
// here (unit-testable in node). Standard PDF fonts are WinAnsi-only, so text
// is sanitized to Latin-1; markdown inline marks are stripped to plain text.

import type { Block } from "@/entities/block";
import type { ExportDatabase, ExportOptions } from "./exportTypes";
import { isDatabaseBlock } from "./databaseExportSource";
import { stripInlineTags } from "./inlineDialect";

export interface PdfLine {
  text: string;
  size: number;
  bold?: boolean;
  mono?: boolean;
  indent: number;
  gapBefore: number;
  /** Image line: `text` is unused, `imageSrc` is fetched + embedded. */
  imageSrc?: string;
}

const HEADING_SIZES = [22, 18, 15.5, 13.5, 12.5, 12] as const;
const BODY = 11;

/** WinAnsi-safe plain text: strip inline markdown marks + non-Latin-1 chars. */
export function pdfText(value: string): string {
  return stripInlineTags(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .replace(/[^\x20-\x7e\xa0-\xff\n\t]/g, "?");
}

function push(lines: PdfLine[], line: PdfLine) {
  if (line.text.trim() || line.imageSrc) lines.push(line);
}

export function flattenBlocksToPdfLines(
  blocks: Block[],
  options: Pick<ExportOptions, "content">,
  resolveDatabase: (block: Block) => ExportDatabase | null,
  depth = 0,
): PdfLine[] {
  const excludeFiles = options.content === "no_files";
  const lines: PdfLine[] = [];
  let numbered = 0;

  for (const block of blocks) {
    const text = pdfText(block.content ?? "");
    const indent = depth * 16;
    if (block.type !== "numbered_list") numbered = 0;
    switch (block.type) {
      case "heading_1": case "heading_2": case "heading_3":
      case "heading_4": case "heading_5": case "heading_6": {
        const level = Number(block.type.slice("heading_".length));
        push(lines, { text, size: HEADING_SIZES[level - 1] ?? BODY, bold: true, indent, gapBefore: 14 });
        break;
      }
      case "bulleted_list":
        push(lines, { text: `• ${text}`, size: BODY, indent, gapBefore: 3 });
        break;
      case "numbered_list":
        numbered += 1;
        push(lines, { text: `${numbered}. ${text}`, size: BODY, indent, gapBefore: 3 });
        break;
      case "to_do":
        push(lines, { text: `[${block.checked ? "x" : " "}] ${text}`, size: BODY, indent, gapBefore: 3 });
        break;
      case "quote":
        push(lines, { text: `« ${text} »`, size: BODY, indent: indent + 12, gapBefore: 8 });
        break;
      case "callout":
        push(lines, { text, size: BODY, bold: true, indent: indent + 12, gapBefore: 8 });
        break;
      case "divider":
        push(lines, { text: "—".repeat(24), size: 9, indent, gapBefore: 10 });
        break;
      case "code": case "equation":
        for (const codeLine of (block.content ?? "").split("\n")) {
          push(lines, { text: pdfText(codeLine) || " ", size: 9.5, mono: true, indent: indent + 8, gapBefore: 1.5 });
        }
        break;
      case "table_block": {
        for (const row of block.tableData ?? []) {
          push(lines, { text: pdfText(row.join("  |  ")), size: 9.5, mono: true, indent, gapBefore: 2 });
        }
        break;
      }
      default: {
        if (block.type === "image") {
          if (!excludeFiles) {
            const src = (block.content ?? "").replace(/^url:/, "");
            if (src) lines.push({ text: "", size: BODY, indent, gapBefore: 8, imageSrc: src });
          }
          break;
        }
        if (block.type === "video" || block.type === "audio" || block.type === "file") {
          if (!excludeFiles && block.content) {
            push(lines, { text: `[${block.type}] ${pdfText(block.content)}`, size: 9.5, indent, gapBefore: 4 });
          }
          break;
        }
        if (isDatabaseBlock(block)) {
          const db = resolveDatabase(block);
          if (db) {
            push(lines, { text: db.title, size: 12.5, bold: true, indent, gapBefore: 12 });
            push(lines, { text: pdfText(db.columns.join("  |  ")), size: 9.5, mono: true, bold: true, indent, gapBefore: 4 });
            for (const row of db.rows) {
              push(lines, { text: pdfText(row.join("  |  ")), size: 9.5, mono: true, indent, gapBefore: 2 });
            }
          }
          break;
        }
        push(lines, { text, size: BODY, indent, gapBefore: 6 });
      }
    }
    if (block.children?.length) {
      lines.push(...flattenBlocksToPdfLines(block.children, options, resolveDatabase, depth + 1));
    }
  }
  return lines;
}
