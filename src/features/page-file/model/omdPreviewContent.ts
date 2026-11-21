// What the .omd preview shows, assembled on the main thread from blocks the preview worker parsed.
import type { Block } from "@/entities/block";
import type { PreviewState } from "@/features/ide/model/previewParseQueue";

import { fileToPage } from "./pageFileCodec";
import { splitFrontMatter } from "./frontMatter";

/** The part of an .omd file the worker parses: what fileToPage would hand the engine. */
export const omdBody = (source: string): string => splitFrontMatter(source).body;

/**
 * Null until the worker has answered, and for every outcome that is not blocks (the caller shows
 * the notice). Caveat: while a newer body is parsing, the previous blocks are shown under the
 * newer front matter's overlay, so a block can briefly carry another block's extras.
 */
export function omdPreviewContent(source: string, state: PreviewState): Block[] | null {
  if (state.kind !== "ready" || !state.document.ok || !("pageBlocks" in state.document)) return null;
  return fileToPage(source, undefined, state.document.pageBlocks).content;
}
