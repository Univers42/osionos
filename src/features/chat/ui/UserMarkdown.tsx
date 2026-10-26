/**
 * A user's message (or a draft) as markdown, through the SAME function the
 * answers use: no raw HTML, no remote image.
 *
 * Plain text keeps its line breaks: the engine joins the lines of a paragraph
 * with a space, so `keepLineBreaks` splits them into paragraphs first.
 * No JSX: the canvas suite renders it under node.
 */

import React, { useMemo } from "react";
import { Eye } from "lucide-react";

import { keepLineBreaks } from "../model/composerMarkdown";
import { ANSWER_TABLE_CLASS, renderAssistantMarkdown } from "../model/assistantMarkdown";

const SHARED =
  "min-w-0 [&_p]:my-0 [&_p+p]:mt-1 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xs [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_code]:font-mono";

// On the accent fill only the on-accent token is readable (see ON_ACCENT_BUTTON).
// "!" because .editor-link in global.css sets its colour with !important.
// Inline code carries its own inline-style chip from the engine.
const ON_ACCENT =
  "[&_a]:text-[var(--osio-accent-fg)]! [&_a:hover]:text-[var(--osio-accent-fg)]! [&_pre]:bg-[color-mix(in_srgb,var(--osio-accent-fg)_20%,transparent)]";

const ON_SURFACE =
  "[&_pre]:bg-[var(--osio-bg-muted)]";

export const UserMarkdown: React.FC<{ markdown: string; tone: "accent" | "surface" }> = ({ markdown, tone }) => {
  const elements = useMemo(() => renderAssistantMarkdown(keepLineBreaks(markdown)), [markdown]);
  return React.createElement(
    "div",
    { className: `${SHARED} ${ANSWER_TABLE_CLASS} ${tone === "accent" ? ON_ACCENT : ON_SURFACE}`, "data-testid": "user-markdown" },
    elements,
  );
};

/** The composer's toggle between the textarea and the draft rendered. */
export const PreviewToggle: React.FC<{ pressed: boolean; onToggle: () => void }> = ({ pressed, onToggle }) =>
  React.createElement(
    "button",
    {
      type: "button",
      "aria-pressed": pressed,
      onClick: onToggle,
      className:
        "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] aria-pressed:bg-[var(--osio-bg-hover)] aria-pressed:text-[var(--osio-fg-default)]",
    },
    React.createElement(Eye, { size: 16 }),
    " Preview",
  );
