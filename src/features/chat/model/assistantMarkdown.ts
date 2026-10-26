/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   assistantMarkdown.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The assistant's answers, as markdown the app can show safely.
 *
 * The app already has a markdown engine — `packages/markdown-engine` — with the
 * parser and the React renderer in it. This module is the ONE place that says
 * HOW an answer is rendered, so the Assistant pane and the dock's AI tab speak
 * the same way. No second parser, no new dependency.
 *
 * Two rules, both about what an answer must never do to the reader:
 *
 * - NO RAW HTML. The renderer runs with `allowHtml: false`, so `<script>` or
 *   `<img onerror=…>` in an answer is TEXT — never an element.
 * - NO REMOTE IMAGES. An image becomes its alt text and a link. A remote
 *   `<img>` would make the browser fetch a URL the answer chose — the reader's
 *   address and the fact they read it would leave the machine (plan D13). A
 *   link is fetched only when the reader clicks it, on purpose.
 */

import React from "react";
import { parse } from "@osionos/markdown-engine";
import { renderReact, type ReactRenderOptions } from "@osionos/markdown-engine/react";

import { AnswerCodeBlock } from "../ui/AnswerCodeBlock";

/**
 * An image, as an answer shows it: the alt text, and a link to the picture.
 *
 * The engine hands over an ALREADY sanitized source (a `javascript:` one never
 * reaches here — it is dropped before this is called).
 */
function imageAsLink(src: string, alt: string): React.ReactElement {
  const label = alt.trim() || src;
  return React.createElement(
    "a",
    {
      href: src,
      target: "_blank",
      rel: "noopener noreferrer",
      className: "editor-link",
      title: src,
    },
    label,
  );
}

/** How an answer is rendered. The same options for every surface. */
export const ASSISTANT_MARKDOWN_OPTIONS: ReactRenderOptions = {
  allowHtml: false,
  externalLinks: true,
  imageRenderer: imageAsLink,
  codeBlockRenderer: (lang, code) => React.createElement(AnswerCodeBlock, { lang, code }),
};

/**
 * The tables of an answer, for the element that holds it: a gutter between the
 * cells and a rule under each row. The engine's cells carry no style, so
 * without it two columns run together ("Above 20%CFO approval"). A wide table
 * scrolls inside the answer instead of widening the pane.
 */
export const ANSWER_TABLE_CLASS =
  "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_th]:border-b [&_th]:border-[var(--osio-border-strong)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border-b [&_td]:border-[var(--osio-border-default)] [&_td]:px-2 [&_td]:py-1 [&_td]:align-top";

/**
 * The answer, as React elements.
 *
 * A half-written answer (the `**` of a bold that has not arrived yet) parses
 * as text — the layout never breaks while the answer streams in.
 */
export function renderAssistantMarkdown(markdown: string): React.ReactElement[] {
  return renderReact(parse(markdown), ASSISTANT_MARKDOWN_OPTIONS);
}
