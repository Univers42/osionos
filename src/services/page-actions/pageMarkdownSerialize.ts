/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageMarkdownSerialize.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

// Block -> markdown, in the dialect the markengine AST parser round-trips back
// to the same Block types (see markengine parseToggle/parseCallout/parseTable):
//   toggle   -> "> [>] summary"     (children indented 2 spaces)
//   callout  -> "> [!icon] title"   (children prefixed "> ")
//   quote    -> "> text"            (children prefixed "> ")
// This keeps the raw-mode round-trip (serialize -> parse) lossless for block
// type, content, list/checkbox state, code language, headings 1-6, toggle
// heading level, equations and tables. Pure view state (collapsed) has no
// markdown form and is not emitted.

function tableBlockToMarkdown(block: Block): string {
  const rows = block.tableData ?? [];
  if (rows.length === 0) return block.content ?? "";
  const aligns = block.tableConfig?.columnAlignments ?? [];
  const escapedPipe = String.raw`\|`;
  const toRow = (cells: string[]) => {
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

/** Render a container's children: blockquote/callout bodies are recognised by a
 *  leading "> " per line; toggle and list children nest by 2-space indent. */
function childMarkdown(block: Block, depth: number): string {
  const children = block.children ?? [];
  if (children.length === 0) return "";
  const rendered = children.map((child) => blockToMarkdown(child, depth + 1));
  if (block.type === "quote" || block.type === "callout") {
    return rendered
      .join("\n")
      .split("\n")
      .map((blockLine) => (blockLine ? `> ${blockLine}` : ">"))
      .join("\n");
  }
  return rendered
    .map((markdown) => markdown.split("\n").map((line) => `  ${line}`).join("\n"))
    .join("\n");
}

export function blockToMarkdown(block: Block, depth = 0): string {
  const content = block.content ?? "";
  let line = content;
  switch (block.type) {
    case "heading_1": case "heading_2": case "heading_3":
    case "heading_4": case "heading_5": case "heading_6":
      line = `${"#".repeat(Number(block.type.slice("heading_".length)))} ${content}`;
      break;
    case "bulleted_list": line = `- ${content}`; break;
    case "numbered_list": line = `1. ${content}`; break;
    case "to_do": line = `- [${block.checked ? "x" : " "}] ${content}`; break;
    case "quote": line = `> ${content}`; break;
    case "toggle":
      // A toggle heading keeps its level via the compact "#..######>" opener;
      // a plain toggle uses the explicit "> [>]" form (bare "> " is a quote).
      line = block.headingLevel
        ? `${"#".repeat(block.headingLevel)}> ${content}`
        : `> [>] ${content}`;
      break;
    case "callout": line = `> [!${block.color || "💡"}] ${content}`; break;
    case "divider": line = "---"; break;
    case "code": line = `\`\`\`${block.language ?? ""}\n${content}\n\`\`\``; break;
    case "equation": line = `$$\n${content}\n$$`; break;
    case "table_block": return tableBlockToMarkdown(block);
    // default: paragraph and any other type keep `content` as-is.
  }
  const children = childMarkdown(block, depth);
  return children ? `${line}\n${children}` : line;
}

/** Serializes a block list to markdown body source (no page-title heading). */
export function serializeBlocksToMarkdown(blocks: Block[]): string {
  return blocks.map((block) => blockToMarkdown(block)).join("\n\n");
}
