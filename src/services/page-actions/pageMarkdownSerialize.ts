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
//   image    -> "![alt](asset "caption")"
//   video    -> <video src="…"></video>     audio -> <audio src="…"></audio>
//   file     -> <object data="…" title="name"></object>
//   draw     -> ```osidraw h=<px> fence     app embeds -> ```osi* JSON fences
//   columns  -> ":::columns" / ":::column <ratio>" containers
// This keeps the raw-mode round-trip (serialize -> parse) lossless for block
// type, content, list/checkbox state, code language, headings 1-6, toggle
// heading level, equations, tables, media, drawings, buttons, database/graph/
// home embeds and column layouts. Pure view state (collapsed) has no markdown
// form and is not emitted.

const escapeAttr = (value: string) => value.replaceAll('"', "&quot;");

/** JSON fence for an app block: only the block's own config keys, pretty-printed. */
function appFence(lang: string, config: Record<string, unknown>): string {
  const entries = Object.entries(config).filter(([, value]) => value !== undefined);
  return `\`\`\`${lang}\n${JSON.stringify(Object.fromEntries(entries), null, 2)}\n\`\`\``;
}

function mediaBlockToMarkdown(block: Block): string {
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

function columnContainerToMarkdown(block: Block, depth: number): string {
  const opener =
    block.type === "column" && typeof block.widthRatio === "number"
      ? `:::column ${block.widthRatio}`
      : block.type === "column"
        ? ":::column"
        : ":::columns";
  const body = (block.children ?? [])
    .map((child) => blockToMarkdown(child, depth + 1))
    .join("\n\n");
  return body ? `${opener}\n${body}\n:::` : `${opener}\n:::`;
}

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
      return columnContainerToMarkdown(block, depth);
    // default: paragraph and any other type keep `content` as-is.
  }
  const children = childMarkdown(block, depth);
  return children ? `${line}\n${children}` : line;
}

/** Serializes a block list to markdown body source (no page-title heading). */
export function serializeBlocksToMarkdown(blocks: Block[]): string {
  return blocks.map((block) => blockToMarkdown(block)).join("\n\n");
}
