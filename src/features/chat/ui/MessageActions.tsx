/**
 * The actions under a message: copy and thumbs up/down under an answer, edit under a
 * user turn. Every action is a real button with a label.
 *
 * The feedback goes to the chat store only; no server route takes it yet.
 * No JSX: the canvas suite renders it under node.
 */

import React, { useState } from "react";
import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";

import type { ChatMessage } from "../model/chatTypes";
import { UserMarkdown } from "./UserMarkdown";
import { copyWord, useCopyFeedback } from "./useCopyFeedback";

export const ACTION_BUTTON =
  "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] aria-pressed:bg-[var(--osio-bg-hover)] aria-pressed:text-[var(--osio-fg-default)] disabled:cursor-default disabled:opacity-50";

const el = React.createElement;

/** Copy (the markdown source) and thumbs up/down of a finished answer. */
export const AssistantActions: React.FC<{
  content: string;
  feedback?: ChatMessage["feedback"];
  onFeedback: (value: "up" | "down") => void;
}> = ({ content, feedback, onFeedback }) => {
  const { state, copy } = useCopyFeedback();
  return el(
    "span",
    { className: "inline-flex items-center gap-1", "data-testid": "message-actions" },
    el("button", { type: "button", className: ACTION_BUTTON, "aria-label": "Copy message", onClick: () => void copy(content) }, el(Copy, { size: 12, "aria-hidden": true }), copyWord(state)),
    el("span", { role: "status", "aria-live": "polite", className: "sr-only" }, state === "copied" ? "Copied" : ""),
    el("button", { type: "button", className: ACTION_BUTTON, "aria-label": "Good answer", "aria-pressed": feedback === "up", onClick: () => onFeedback("up") }, el(ThumbsUp, { size: 13, "aria-hidden": true })),
    el("button", { type: "button", className: ACTION_BUTTON, "aria-label": "Bad answer", "aria-pressed": feedback === "down", onClick: () => onFeedback("down") }, el(ThumbsDown, { size: 13, "aria-hidden": true })),
  );
};

/** A model id as a reader would say it: the provider prefix is noise. */
export function modelLabel(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1) || id;
}

/** The sentence under an answer that a fallback gave. */
export function routeNoteText(
  primary: string,
  answeredBy: string,
  reason: NonNullable<ChatMessage["routeReason"]>,
): string {
  const why = reason === "rate_limited" ? "was busy" : "was unavailable";
  return `Answered by ${modelLabel(answeredBy)} — ${modelLabel(primary)} ${why}`;
}

/** Muted line next to the actions of an answer that moved to another model. */
export const RouteNote: React.FC<{
  primary: string;
  answeredBy: string;
  reason: NonNullable<ChatMessage["routeReason"]>;
}> = ({ primary, answeredBy, reason }) =>
  el(
    "span",
    { className: "mr-auto text-2xs text-[var(--osio-fg-muted)]", "data-testid": "route-note" },
    routeNoteText(primary, answeredBy, reason),
  );

/** A user turn: its text, or the textarea that edits it. */
export const UserBubble: React.FC<{
  content: string;
  /** False while an answer is streaming: an edit would race the run. */
  canEdit: boolean;
  onResend: (text: string) => void;
}> = ({ content, canEdit, onResend }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  if (editing) {
    return el(
      "span",
      { className: "flex flex-col gap-2" },
      el("textarea", {
        value: draft,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
        "aria-label": "Edit message",
        rows: 3,
        className: "w-full resize-y rounded-xs bg-[var(--osio-bg-muted)] p-2 text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]",
      }),
      el(
        "span",
        { className: "flex justify-end gap-2" },
        el("button", { type: "button", className: ACTION_BUTTON, "aria-label": "Cancel edit", onClick: () => { setDraft(content); setEditing(false); } }, "Cancel"),
        el(
          "button",
          { type: "button", className: ACTION_BUTTON, "aria-label": "Send edited message", disabled: !draft.trim(), onClick: () => { setEditing(false); onResend(draft); } },
          "Send",
        ),
      ),
    );
  }
  return el(
    React.Fragment,
    null,
    el(UserMarkdown, { markdown: content }),
    canEdit
      ? el(
          "span",
          { className: "mt-1 flex justify-end" },
          el("button", { type: "button", className: ACTION_BUTTON, "aria-label": "Edit message", onClick: () => { setDraft(content); setEditing(true); } }, "Edit"),
        )
      : null,
  );
};
