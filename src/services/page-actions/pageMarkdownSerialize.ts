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
import { appFence, escapeParagraphContent, mediaBlockToMarkdown, tableBlockToMarkdown } from "./pageMarkdownEscape";
import { indentLines, isListItem, joinTight, joinWithEmpties } from "./pageMarkdownJoin";
import type { SerializeOptions } from "./pageMarkdownEscape";

// Block -> markdown, in the dialect the markengine AST parser round-trips back
// to the same Block types (see markengine parseToggle/parseCallout/parseTable):
//   toggle   -> "> [>] summary"     (children indented 1 tab: 2 spaces over-strip
//                                     a toggle nested in a toggle on parse)
//   callout  -> "> [!icon] title"   (children prefixed "> ")
//   quote    -> "> text"            (children prefixed "> ")
//   image    -> "![alt](asset "caption")"
//   video    -> <video src="…"></video>     audio -> <audio src="…"></audio>
//   file     -> <object data="…" title="name"></object>
//   draw     -> ```osidraw h=<px> fence     app embeds -> ```osi* JSON fences
//   columns  -> ":::columns" / ":::column <ratio>" containers
// Paragraph text that would parse as another block gets a backslash escape.
// Pure view state (collapsed) has no markdown form and is not emitted.
// Empty paragraphs are opt-in (`keepEmptyParagraphs`, page files only): each
// adds one blank line at its indentation; without it they collapse away.

function columnContainerToMarkdown(block: Block, depth: number, options?: SerializeOptions): string {
  const opener =
    block.type === "column" && typeof block.widthRatio === "number"
      ? `:::column ${block.widthRatio}`
      : block.type === "column"
        ? ":::column"
        : ":::columns";
  const body = (block.children ?? [])
    .map((child) => blockToMarkdown(child, depth + 1, options))
    .join("\n\n");
  return body ? `${opener}\n${body}\n:::` : `${opener}\n:::`;
}

/** Blockquote/callout bodies are recognised by a leading "> " per line; toggle
 *  children nest by tab, list children by 2 spaces. O(T). */
function childMarkdown(block: Block, depth: number, options?: SerializeOptions): string {
  const children = block.children ?? [];
  if (children.length === 0) return "";
  if (block.type === "quote" || block.type === "callout") {
    const rendered = children.map((child) => blockToMarkdown(child, depth + 1, options));
    return rendered.join("\n").split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
  }
  const prefix = block.type === "toggle" ? "\t" : "  ";
  const render = (child: Block): string => indentLines(blockToMarkdown(child, depth + 1, options), prefix);
  return options?.keepEmptyParagraphs === true ? joinWithEmpties(children, render, prefix) : joinTight(children, render);
}

export function blockToMarkdown(block: Block, depth = 0, options?: SerializeOptions): string {
  const content = block.content ?? "";
  let line = content;
  switch (block.type) {
    case "paragraph": case "placeholder":
      line = escapeParagraphContent(content);
      break;
    case "heading_1": case "heading_2": case "heading_3":
    case "heading_4": case "heading_5": case "heading_6":
      line = `${"#".repeat(Number(block.type.slice("heading_".length)))} ${content}`;
      break;
    case "bulleted_list": line = `- ${content}`; break;
    case "numbered_list": line = `1. ${content}`; break;
    case "to_do": line = `- [${block.checked ? "x" : " "}] ${content}`; break;
    case "quote":
      // Prefix EVERY line so multi-line quotes (and a trailing "— Source" citation) stay
      // inside the blockquote on round-trip instead of splitting into a sibling paragraph.
      line = content.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
      break;
    case "toggle":
      // A toggle heading keeps its level via the compact "#..######>" opener;
      // a plain toggle uses the explicit "> [>]" form (bare "> " is a quote).
      line = block.headingLevel
        ? `${"#".repeat(block.headingLevel)}> ${content}`
        : `> [>] ${content}`;
      break;
    case "callout": {
      const cl = content.split("\n");
      line = [`> [!${block.color || "💡"}] ${cl[0] ?? ""}`, ...cl.slice(1).map((l) => (l ? `> ${l}` : ">"))].join("\n");
      break;
    }
    case "divider": line = "---"; break;
    case "code": line = `\`\`\`${block.language ?? ""}\n${content}\n\`\`\``; break;
    case "equation": line = `$$\n${content}\n$$`; break;
    case "table_block": return tableBlockToMarkdown(block);
    // A drawing's content is an .osidraw JSON blob — fence it so it never leaks
    // raw into markdown exports or the clipboard (and can round-trip back).
    case "draw":
      line = content
        ? `\`\`\`osidraw${block.drawHeight ? ` h=${block.drawHeight}` : ""}\n${content}\n\`\`\``
        : "*[drawing]*";
      break;
    case "image": case "video": case "audio": case "file":
      line = mediaBlockToMarkdown(block);
      break;
    case "button":
      return appFence("osibutton", {
        buttonLabel: block.buttonLabel,
        buttonHref: block.buttonHref,
        buttonVariant: block.buttonVariant,
        content: content || undefined,
      });
    case "database_inline":
      return appFence("osidb", {
        databaseId: block.databaseId,
        viewId: block.viewId,
        recordLimit: block.recordLimit,
      });
    case "database_full_page":
      return appFence("osidb-page", {
        databaseId: block.databaseId,
        viewId: block.viewId,
      });
    case "graph_view":
      return appFence("osigraph", {});
    case "home_views":
      return appFence("osihome", {});
    case "layout":
      return appFence("osilayout", {
        layoutMode: block.layoutMode,
        layoutRole: block.layoutRole,
        layoutConfig: block.layoutConfig,
        layoutCells: block.layoutCells,
        schemaVersion: block.schemaVersion,
      });
    case "column_list": case "column":
      return columnContainerToMarkdown(block, depth, options);
  }
  const children = childMarkdown(block, depth, options);
  if (!children) return line;
  // A list item's text and a first child that is not a list item would merge on
  // parse without a blank separator (a nested list stays tight in the clipboard
  // form). The toggle header parses on its own, so it joins directly: a leading
  // blank would read as an empty paragraph.
  if (!isListItem(block)) return `${line}\n${children}`;
  const tight = options?.keepEmptyParagraphs !== true && isListItem(block.children?.[0]);
  return `${line}${tight ? "\n" : "\n\n"}${children}`;
}

/**
 * Body source (no page-title heading). The default keeps today's top-level
 * bytes; `keepEmptyParagraphs` adds one blank per empty paragraph: leading
 * "\n", between "\n\n\n", trailing "\n\n". O(T).
 */
export function serializeBlocksToMarkdown(blocks: Block[], options?: SerializeOptions): string {
  const render = (block: Block): string => blockToMarkdown(block, 0, options);
  if (options?.keepEmptyParagraphs === true) return joinWithEmpties(blocks, render, "");
  return blocks.map(render).join("\n\n");
}
