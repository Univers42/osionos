// Markdown text -> stored page blocks, the one conversion the editor's import and the
// bridge's POST /api/pages/from-markdown share (osionos#240, ruling M240-10). The bridge
// runs it from scripts/bridge-markdown-engine.mjs, an esbuild bundle of this file built
// by scripts/build-bridge-markdown-engine.mjs: change this file and the drift test asks
// for a rebuild, so the API and the editor cannot disagree.

import { parseMarkdownToBlocks } from "@osionos/markdown-engine/blocks";

import { sanitizeLinkBlockFields } from "./linkBlocks";
import type { Block } from "./types";

/** The blocks an import of `markdown` stores: engine defaults, embed fields re-validated. */
export function markdownImportBlocks(markdown: string): Block[] {
  return sanitizeLinkBlockFields(parseMarkdownToBlocks(markdown));
}
