/**
 * The reasoning of a message, and whether its note starts open.
 *
 * The text is the model's thinking: shown as plain text, never as markdown.
 */

import type { ChatMessage } from "./chatTypes";

/** The reasoning parts of a message, in order, as one text. Empty when there are none. */
export function reasoningText(parts: ChatMessage["parts"]): string {
  if (!parts) return "";
  return parts
    .filter((part): part is Extract<typeof part, { type: "reasoning" }> => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n\n");
}

/** Open while the model is still thinking: streaming, and no answer text yet. */
export function reasoningStartsOpen(status: ChatMessage["status"], content: string): boolean {
  return status === "streaming" && content === "";
}
