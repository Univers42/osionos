import type { Block } from "./types";

// A markdown code block is drawn as a document only when the owner switched it to preview.
// The flag must be explicit: mermaid defaults to preview when it is absent, markdown must
// default to source so a block written before this existed keeps showing its text.
export function isMarkdownPreview(block: Pick<Block, "language" | "codeView">): boolean {
  return block.language === "markdown" && block.codeView === "preview";
}
