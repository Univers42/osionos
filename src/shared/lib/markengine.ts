/**
 * Public integration surface for the `src/lib/markengine` submodule.
 *
 * The submodule itself is a git submodule folder (not a TS module entrypoint),
 * so importing `../lib/markengine` from app code must resolve to this file.
 */

export {
  BLOCK_SHORTCUTS,
  detectBlockType,
  parseInlineMarkdown,
  parseMarkdownToBlocks,
} from "./markengine/shortcuts";

export type { BlockDetection } from "./markengine/shortcuts";

