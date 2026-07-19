/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportHtml.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Standalone HTML export: one self-contained document, no external assets,
// inline marks via a minimal local markdown converter (see renderInline),
// toggles as native <details>. Kept deliberately printable.

import type { Block } from "@/entities/block";
import { isDatabaseBlock } from "./databaseExportSource";
import { inlineTagsToHtml } from "./inlineDialect";
import type { ExportOptions, ExportTheme } from "./exportTypes";

const MEDIA_TYPES = new Set(["image", "video", "audio", "file"]);

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Minimal inline markdown → HTML for the export dialect (code, links, bold,
 * italic, strikethrough). Self-contained on purpose: the editor's own inline
 * renderer emits editor DOM (token vars, tooltips) that has no place in a
 * standalone document. Escapes first, then applies marks on escaped text.
 */
export function renderInline(markdown: string): string {
  let out = inlineTagsToHtml(escapeHtml(markdown));
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code);
    return `\uE000${codes.length - 1}\uE000`; // PUA sentinel, never in user text
  });
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return out.replace(/\uE000(\d+)\uE000/g, (_, index: string) => `<code>${codes[Number(index)]}</code>`);
}

function renderTable(block: Block): string {
  const rows = block.tableData ?? [];
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const cells = (row: string[], tag: string) =>
    row.map((cell) => `<${tag}>${renderInline(cell)}</${tag}>`).join("");
  return `<table><thead><tr>${cells(header ?? [], "th")}</tr></thead><tbody>${body
    .map((row) => `<tr>${cells(row, "td")}</tr>`)
    .join("")}</tbody></table>`;
}

function mediaHtml(block: Block, excludeFiles: boolean): string {
  if (excludeFiles) return "";
  const raw = block.content ?? "";
  const src = raw.startsWith("url:") ? raw.slice(4) : raw;
  if (!src) return "";
  if (block.type === "image") return `<figure><img src="${escapeHtml(src)}" alt=""></figure>`;
  return `<p><a href="${escapeHtml(src)}">${escapeHtml(block.type)}</a></p>`;
}

export function renderBlocksHtml(
  blocks: Block[],
  options: Pick<ExportOptions, "content">,
  databaseHtml: (block: Block) => string | null,
): string {
  const excludeFiles = options.content === "no_files";
  const parts: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushList = () => {
    if (list) parts.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`);
    list = null;
  };
  const children = (block: Block) =>
    block.children?.length ? renderBlocksHtml(block.children, options, databaseHtml) : "";

  for (const block of blocks) {
    const inline = renderInline(block.content ?? "");
    const isBullet = block.type === "bulleted_list";
    const isNumbered = block.type === "numbered_list";
    if (isBullet || isNumbered) {
      const tag = isBullet ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(`<li>${inline}${children(block)}</li>`);
      continue;
    }
    flushList();
    switch (block.type) {
      case "heading_1": case "heading_2": case "heading_3":
      case "heading_4": case "heading_5": case "heading_6": {
        const level = Math.min(6, Number(block.type.slice("heading_".length)) + 1);
        parts.push(`<h${level}>${inline}</h${level}>`);
        break;
      }
      case "to_do":
        parts.push(`<p class="todo"><input type="checkbox" disabled${block.checked ? " checked" : ""}> ${inline}</p>${children(block)}`);
        break;
      case "quote":
        parts.push(`<blockquote>${inline ? `<p>${inline}</p>` : ""}${children(block)}</blockquote>`);
        break;
      case "toggle":
        parts.push(`<details open><summary>${inline}</summary>${children(block)}</details>`);
        break;
      case "callout":
        parts.push(`<aside class="callout">${inline ? `<p>${inline}</p>` : ""}${children(block)}</aside>`);
        break;
      case "divider": parts.push("<hr>"); break;
      case "code":
        parts.push(`<pre><code>${escapeHtml(block.content ?? "")}</code></pre>`);
        break;
      case "equation":
        parts.push(`<pre class="equation">${escapeHtml(block.content ?? "")}</pre>`);
        break;
      case "table_block": parts.push(renderTable(block)); break;
      default: {
        if (MEDIA_TYPES.has(block.type)) { parts.push(mediaHtml(block, excludeFiles)); break; }
        if (isDatabaseBlock(block)) { parts.push(databaseHtml(block) ?? ""); break; }
        parts.push(`<p>${inline}</p>${children(block)}`);
      }
    }
  }
  flushList();
  return parts.join("\n");
}

const DOC_CSS = [
  "body{font-family:ui-sans-serif,-apple-system,'Segoe UI',sans-serif;max-width:760px;",
  "margin:40px auto;padding:0 24px;line-height:1.6;color:#1f1f1f}",
  "pre{background:#f5f5f4;padding:12px;border-radius:6px;overflow-x:auto}",
  "code{font-family:ui-monospace,monospace;font-size:0.92em}",
  "blockquote{border-left:3px solid #d6d3d1;margin:0;padding-left:14px;color:#555}",
  "aside.callout{background:#f5f5f4;border-radius:8px;padding:12px 14px}",
  "table{border-collapse:collapse;width:100%}td,th{border:1px solid #d6d3d1;padding:6px 10px;text-align:left}",
  "img{max-width:100%;border-radius:6px}hr{border:0;border-top:1px solid #d6d3d1}",
].join("");

/** Later-wins overrides mapping the captured editor theme onto DOC_CSS. */
export function themeCss(theme: ExportTheme): string {
  return [
    `body{background:${theme.bg};color:${theme.fg};font-family:${theme.fontSans}}`,
    `a{color:${theme.accent}}`,
    `pre,aside.callout{background:${theme.codeBg}}`,
    `pre,code{color:${theme.codeFg};font-family:${theme.fontMono}}`,
    `blockquote{border-left-color:${theme.border};color:${theme.fgMuted}}`,
    `td,th{border-color:${theme.border}}hr{border-top-color:${theme.border}}`,
  ].join("");
}

/**
 * Full standalone HTML document for one page. styling "styled" (default)
 * embeds the document CSS — themed with the live editor tokens when a
 * captured `theme` is provided; "raw" emits bare semantic HTML, no styles.
 */
export function exportPageHtml(
  title: string,
  blocks: Block[],
  options: Pick<ExportOptions, "content"> & { styling?: ExportOptions["styling"] },
  databaseHtml: (block: Block) => string | null,
  theme?: ExportTheme | null,
): string {
  const safeTitle = escapeHtml(title || "Untitled");
  const body = renderBlocksHtml(blocks, options, databaseHtml);
  const style = options.styling === "raw"
    ? ""
    : `\n<style>${DOC_CSS}${theme ? themeCss(theme) : ""}</style>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>${style}
</head>
<body>
<h1>${safeTitle}</h1>
${body}
</body>
</html>
`;
}

/** HTML table for a resolved database (used inline in HTML export). */
export function databaseTableHtml(title: string, columns: string[], rows: string[][]): string {
  const head = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<h3>${escapeHtml(title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
