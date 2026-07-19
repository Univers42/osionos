/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportMarkdown.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown export = the raw-mode serializer (lossless dialect) over a
// transformed copy of the block tree: media blocks become markdown
// image/link lines (or vanish under "exclude files & images") and database
// blocks become a reference line to their exported CSV. The shared
// serializer itself is untouched — export owns its dialect deltas.

import type { Block } from "@/entities/block";
// Deep import (not the barrel) so the node strip-types canvas runner never
// meets the api client's parameter properties.
import { serializeBlocksToMarkdown } from "@/services/page-actions/pageMarkdownSerialize";
import { isDatabaseBlock } from "./databaseExportSource";
import { inlineToMarkdown } from "./inlineDialect";
import type { ExportOptions } from "./exportTypes";

const MEDIA_TYPES = new Set(["image", "video", "audio", "file"]);

function mediaSource(block: Block): string {
  const raw = block.content ?? "";
  return raw.startsWith("url:") ? raw.slice(4) : raw;
}

function paragraph(content: string): Block {
  return { id: `export-${Math.random().toString(36).slice(2)}`, type: "paragraph", content } as Block;
}

/**
 * Clone + rewrite a block tree for export. `databaseRef` returns the markdown
 * line for a database block (e.g. a link to its CSV) or null to drop it.
 * styling "raw" keeps the editor's bracket inline dialect verbatim (lossless,
 * re-importable); "styled" (default) corrects it to standard markdown.
 */
export function transformBlocksForExport(
  blocks: Block[],
  options: Pick<ExportOptions, "content"> & { styling?: ExportOptions["styling"] },
  databaseRef: (block: Block) => string | null,
): Block[] {
  const excludeFiles = options.content === "no_files";
  const keepDialect = options.styling === "raw";
  const out: Block[] = [];
  for (const block of blocks) {
    if (MEDIA_TYPES.has(block.type)) {
      if (excludeFiles) continue;
      const src = mediaSource(block);
      if (!src) continue;
      out.push(paragraph(block.type === "image" ? `![](${src})` : `[${block.type}](${src})`));
      continue;
    }
    if (isDatabaseBlock(block)) {
      const ref = databaseRef(block);
      if (ref) out.push(paragraph(ref));
      continue;
    }
    const children = block.children?.length
      ? transformBlocksForExport(block.children, options, databaseRef)
      : undefined;
    // Code/equation bodies are verbatim; everything else translates the
    // editor's bracket inline dialect to standard markdown (unless raw).
    const content = keepDialect || block.type === "code" || block.type === "equation"
      ? block.content
      : inlineToMarkdown(block.content ?? "");
    out.push({ ...block, content, children });
  }
  return out;
}

/** Full markdown document for one page: H1 title + serialized body. */
export function exportPageMarkdown(
  title: string,
  blocks: Block[],
  options: Pick<ExportOptions, "content"> & { styling?: ExportOptions["styling"] },
  databaseRef: (block: Block) => string | null,
): string {
  const body = serializeBlocksToMarkdown(transformBlocksForExport(blocks, options, databaseRef));
  return `# ${title || "Untitled"}\n\n${body}\n`;
}
