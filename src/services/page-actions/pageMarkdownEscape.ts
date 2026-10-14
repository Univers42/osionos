/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageMarkdownEscape.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

/** Serialize options: `keepEmptyParagraphs` is opt-in (page files only). */
export interface SerializeOptions {
  keepEmptyParagraphs?: boolean;
}

/** A paragraph with no text and no children is an empty paragraph. O(1). */
export function isEmptyParagraph(block: Block): boolean {
  return block.type === "paragraph" && (block.content ?? "") === "" &&
    (block.children === undefined || block.children.length === 0);
}

const ORDERED_RE = /^(\d{1,9})([.)])/;
const HEADING_RE = /^#{1,6}(\s|$)/;
const COMPACT_TOGGLE_RE = /^#{1,6}>/;
const FENCE_RE = /^(`{3,}|~{3,})/;
const REFDEF_RE = /^\[[^\]\n]*\]:\s*\S/;
const FOOTNOTE_RE = /^\[\^[^\]\n]*\]:\s/;
const REVERSED_LINK_RE = /^\(.*\)\[/;
const HTML_LETTER_RE = /^<[a-zA-Z]/;
const HTML_COMMENT_RE = /^<!--/;
const BULLET_RE = /^[-*+](\s|$)/;
const BANG_BRACKET_RE = /^!\[/;

/** True for ASCII punctuation CommonMark lets a backslash escape. O(1). */
function isEscapable(code: number): boolean {
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
}

/**
 * Whether a paragraph line would parse as a non-paragraph block, so it needs
 * a backslash escape. Single-line check; the caller maps it over every line.
 * O(L): L line length, one pass over the prefix.
 */
function needsEscape(line: string): boolean {
  if (line === "") return false;
  const first = line.charCodeAt(0);
  if (first === 92) {
    // Ponytail: a lone trailing "\" or "\x" with non-punctuation x needs no
    // escape (the parser keeps it literal); only "\p" with punctuation loses it.
    return line.length > 1 && isEscapable(line.charCodeAt(1));
  }
  const head = line[0];
  if (head === "-" || head === "*" || head === "+" || head === "_") {
    if (BULLET_RE.test(line)) return true;
    return isThematicLine(line);
  }
  if (head >= "0" && head <= "9") return ORDERED_RE.test(line);
  if (head === "#") return HEADING_RE.test(line) || COMPACT_TOGGLE_RE.test(line);
  if (head === ">") return true;
  if (head === "`" || head === "~") return FENCE_RE.test(line);
  if (head === "$") return line.startsWith("$$");
  if (head === "<") return HTML_LETTER_RE.test(line) || HTML_COMMENT_RE.test(line);
  if (head === ":") return true;
  if (head === "[") return REFDEF_RE.test(line) || FOOTNOTE_RE.test(line);
  if (head === "!") return BANG_BRACKET_RE.test(line);
  if (head === "(") return REVERSED_LINK_RE.test(line);
  return false;
}

/**
 * Single charCode pass: 3+ of one marker (- * _) with only whitespace between.
 * O(L): L line length. Ponytail: a line mixing markers ("- * -") is not a
 * thematic break (returns false) and is kept literal without an escape.
 */
function isThematicLine(line: string): boolean {
  let marker = 0;
  let count = 0;
  for (let index = 0; index < line.length; index++) {
    const code = line.charCodeAt(index);
    if (code === 32 || code === 9 || code === 13) continue;
    if (code !== 45 && code !== 42 && code !== 95) return false;
    if (marker === 0) marker = code;
    else if (code !== marker) return false;
    count += 1;
  }
  return count >= 3;
}

/**
 * Escape one paragraph line so it parses back as a paragraph. Ordered items
 * escape their `.`/`)`, every other marker escapes its first character, and a
 * leading backslash before punctuation escapes itself. O(L): L line length.
 */
export function escapeParagraphLine(line: string): string {
  if (!needsEscape(line)) return line;
  if (line.charCodeAt(0) === 92) {
    let count = 0;
    while (line.charCodeAt(count) === 92) count += 1;
    return `${"\\".repeat(count * 2)}${line.slice(count)}`;
  }
  const ordered = ORDERED_RE.exec(line);
  if (ordered) return `${ordered[1]}\\${ordered[2]}${line.slice(ordered[0].length)}`;
  return `\\${line}`;
}

/**
 * Escape every line of a paragraph body so multi-line text with marker-led
 * continuation lines stays one paragraph. O(T): T total characters.
 */
export function escapeParagraphContent(content: string): string {
  if (!content.includes("\n")) return escapeParagraphLine(content);
  return content.split("\n").map(escapeParagraphLine).join("\n");
}

const escapeAttr = (value: string): string => value.replaceAll('"', "&quot;");

/** JSON fence for an app block: only the block's own config keys, pretty-printed. */
export function appFence(lang: string, config: Record<string, unknown>): string {
  const entries = Object.entries(config).filter(([, value]) => value !== undefined);
  return `\`\`\`${lang}\n${JSON.stringify(Object.fromEntries(entries), null, 2)}\n\`\`\``;
}

/** O(A): A asset/caption length, single pass each. */
export function mediaBlockToMarkdown(block: Block): string {
  const asset = typeof block.asset === "string" ? block.asset : "";
  const caption = block.content ?? "";
  switch (block.type) {
    case "image": {
      const title = caption ? ` "${caption.replaceAll('"', "'")}"` : "";
      return `![${block.mediaAlt ?? ""}](${asset}${title})`;
    }
    case "video":
      return `<video src="${escapeAttr(asset)}"${caption ? ` data-caption="${escapeAttr(caption)}"` : ""}></video>`;
    case "audio":
      return `<audio src="${escapeAttr(asset)}"${caption ? ` data-caption="${escapeAttr(caption)}"` : ""}></audio>`;
    default: {
      const title = block.fileName ?? caption;
      return `<object data="${escapeAttr(asset)}"${title ? ` title="${escapeAttr(title)}"` : ""}></object>`;
    }
  }
}

/**
 * Table rows to GFM source, escaping literal pipes. O(R×C): R rows, C columns.
 * Ponytail: a cell holding a newline is written raw (the row splits on parse);
 * the fidelity generator never emits one, so the round-trip stays lossless.
 */
export function tableBlockToMarkdown(block: Block): string {
  const rows = block.tableData ?? [];
  if (rows.length === 0) return block.content ?? "";
  const aligns = block.tableConfig?.columnAlignments ?? [];
  const escapedPipe = String.raw`\|`;
  const toRow = (cells: string[]): string => {
    const escaped = cells.map((cell) => cell.replaceAll("|", escapedPipe)).join(" | ");
    return `| ${escaped} |`;
  };
  const separator = (rows[0] ?? []).map((_, index) => {
    const align = aligns[index];
    if (align === "left") return ":---";
    if (align === "right") return "---:";
    if (align === "center") return ":---:";
    return "---";
  });
  const [header, ...body] = rows;
  return [toRow(header ?? []), `| ${separator.join(" | ")} |`, ...body.map(toRow)].join("\n");
}
