/**
 * The reasoning of a message: a collapsed note, plain text inside.
 *
 * The text is the model's thinking — untrusted, so a text node, never markdown.
 * No JSX: the canvas suite renders it under node.
 */

import React from "react";

import type { ChatMessage } from "../model/chatTypes";
import { reasoningStartsOpen, reasoningText } from "../model/reasoning";

export const ReasoningNote: React.FC<{ parts: ChatMessage["parts"]; status: ChatMessage["status"]; content: string }> = ({
  parts,
  status,
  content,
}) => {
  const text = reasoningText(parts);
  if (!text) return null;
  return React.createElement(
    "details",
    { open: reasoningStartsOpen(status, content), className: "mb-2 text-xs text-[var(--osio-fg-muted)]", "data-testid": "chat-reasoning" },
    React.createElement("summary", { className: "cursor-pointer select-none" }, "Reasoning"),
    React.createElement("p", { className: "mt-1 whitespace-pre-wrap" }, text),
  );
};
