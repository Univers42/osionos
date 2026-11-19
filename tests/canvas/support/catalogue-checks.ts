// The checks every shell and section must pass (ADR 0064 PS17, PS21; ADR 0065 CV15),
// shared by the section and shell catalogue tests.

import type { Block } from "../../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../../src/entities/page/model/types.ts";
import { serializeBlocksToMarkdown } from "../../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../../packages/markdown-engine/markdown/shortcuts.ts";
import { fileToPage, pageToFile } from "../../../src/features/page-file/model/pageFileCodec.ts";

const KEEP = { keepEmptyParagraphs: true } as const;

/** Block levels from the root (a top-level block is level 1). */
export function blockDepth(blocks: readonly Block[] | undefined): number {
  let deepest = 0;
  for (const block of blocks ?? []) {
    const cells = (block.layoutCells ?? []).map((cell) => blockDepth(cell.blocks));
    deepest = Math.max(deepest, 1 + Math.max(blockDepth(block.children), ...cells));
  }
  return deepest;
}

// The fields plain markdown carries. Ids and `style` ride only in the .omd overlay
// (no attribute writer on develop yet), so the markdown path is compared on these.
const MARKDOWN_KEYS = ["type", "content", "checked", "language", "widthRatio", "asset", "buttonLabel", "buttonHref", "buttonVariant", "mediaAlt"] as const;

/** A block reduced to what markdown carries, children included. */
export function markdownProjection(blocks: readonly Block[] | undefined): unknown[] {
  return (blocks ?? []).map((block) => {
    const picked: Record<string, unknown> = {};
    for (const key of MARKDOWN_KEYS) if (block[key] !== undefined) picked[key] = block[key];
    if (block.children?.length) picked.children = markdownProjection(block.children);
    return picked;
  });
}

export function markdownRoundTrip(blocks: Block[]): Block[] {
  return parseMarkdownToBlocks(serializeBlocksToMarkdown(blocks, KEEP), KEEP) as Block[];
}

/** The page as an .omd file and back: every key, ids and style included. */
export function fileRoundTrip(blocks: Block[]): Block[] {
  const page: PageEntry = { _id: "catalogue-page", title: "Catalogue", workspaceId: "ws", content: blocks } as PageEntry;
  return fileToPage(pageToFile(page)).content;
}

const COVER_LAYOUT_KEYS = ["coverHeight", "coverWidth", "cover_height", "cover_width"];

/** Every cover-layout key found anywhere in a value (ADR 0065 CV15). */
export function coverLayoutKeysIn(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) coverLayoutKeysIn(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (COVER_LAYOUT_KEYS.includes(key)) found.push(key);
      coverLayoutKeysIn(inner, found);
    }
  }
  return found;
}
