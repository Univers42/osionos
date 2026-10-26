/**
 * A fenced block of an answer: language label, Copy, Wrap, and the code.
 *
 * The code is TEXT in a `<pre><code>` — no highlighter, no markup from the
 * answer. A mermaid fence is drawn through the context's drawer (the locked
 * path) when the answer is complete; a source the locked renderer refuses
 * stays code, with the reason.
 *
 * The file holds NO JSX on purpose: the canvas suite renders it under node.
 */

import React, { useContext, useState } from "react";

import { codeBlockView, DIAGRAM_REFUSED_NOTE } from "../model/answerCode";
import { AnswerRenderContext } from "./answerRenderContext";
import { copyWord, useCopyFeedback } from "./useCopyFeedback";

const BUTTON =
  "cursor-pointer rounded-xs px-1.5 py-0.5 text-2xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] aria-pressed:bg-[var(--osio-bg-hover)]";

const el = React.createElement;

const CodeBlock: React.FC<{ label: string; code: string; note?: string }> = ({ label, code, note }) => {
  const { state, copy } = useCopyFeedback();
  const [wrap, setWrap] = useState(false);
  return el(
    "div",
    { className: "my-2 overflow-hidden rounded-xs border border-[var(--osio-border-default)]", "data-testid": "answer-code" },
    el(
      "div",
      { className: "flex items-center justify-between gap-2 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-0.5" },
      el("span", { className: "font-mono text-2xs text-[var(--osio-fg-muted)]" }, label),
      el(
        "span",
        { className: "flex items-center gap-1" },
        el(
          "button",
          { type: "button", className: BUTTON, "aria-pressed": wrap, "aria-label": "Wrap lines", onClick: () => setWrap((on) => !on) },
          "Wrap",
        ),
        el(
          "button",
          { type: "button", className: BUTTON, "aria-label": "Copy code", onClick: () => void copy(code) },
          copyWord(state),
        ),
        el("span", { role: "status", "aria-live": "polite", className: "sr-only" }, state === "copied" ? "Copied" : ""),
      ),
    ),
    el(
      "pre",
      { style: { margin: 0, fontVariantLigatures: "none" }, className: wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto" },
      el("code", null, code),
    ),
    note ? el("p", { role: "note", className: "px-2 py-1 text-xs text-[var(--osio-fg-muted)]" }, note) : null,
  );
};

/** One fence of an answer. */
export const AnswerCodeBlock: React.FC<{ lang: string; code: string }> = ({ lang, code }) => {
  const { complete, drawDiagram } = useContext(AnswerRenderContext);
  const view = codeBlockView(lang, code, complete && drawDiagram !== undefined);
  if (view.kind === "diagram" && drawDiagram) {
    return el("div", { className: "my-2", "data-testid": "answer-diagram" }, drawDiagram(view.source));
  }
  return el(CodeBlock, { label: view.label, code, note: view.kind === "refused" ? DIAGRAM_REFUSED_NOTE : undefined });
};
