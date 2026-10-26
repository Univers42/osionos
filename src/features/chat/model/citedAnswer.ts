/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   citedAnswer.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The answer, with its sources.
 *
 * The answer is markdown, and the markdown engine the app already has renders
 * it. The sources are markers in that text: `[1]`, `[2]`… A marker that has a
 * source becomes a small button that opens the page; a marker without one
 * stays the text it was.
 *
 * HOW THE MARKERS SURVIVE THE MARKDOWN: the marker is replaced by a token of
 * private-use characters BEFORE the answer is parsed. The engine never sees
 * `[1]`, so it never reads it as a link reference, and the token comes back
 * untouched in the rendered text — where it becomes the button. The answer is
 * parsed ONCE: the emphasis, the lists and the code around a marker are the
 * ones the reader wrote.
 *
 * A marker inside code is left alone: `` `[1]` `` stays `` `[1]` ``.
 *
 * The titles and the snippets are PLAIN TEXT. They come from workspace pages,
 * so they are written as text nodes and as tooltips — never as markdown, never
 * as HTML.
 */

import React from "react";
import { parse } from "@osionos/markdown-engine";
import { renderReact } from "@osionos/markdown-engine/react";

import { ASSISTANT_MARKDOWN_OPTIONS } from "./assistantMarkdown";
import { segmentAnswer, type Citation } from "./citations";

/** The token that stands for a marker while the answer is parsed. */
const MARK_OPEN = "\uE000";
const MARK_CLOSE = "\uE001";
/** The token of one marker, and the number it carries. */
const MARK = /\uE000(\d+)\uE001/;
/** The split that keeps the tokens in the parts of a text node. */
const MARK_SPLIT = /(\uE000\d+\uE001)/;

/**
 * The answer with its markers turned into tokens.
 *
 * The code of the answer is left exactly as it was: a marker in code is not a
 * marker, so it stays the text the reader sees.
 */
export function markCitations(text: string, citations: Citation[]): string {
  const segments = segmentAnswer(text, citations);
  let marked = "";
  let last = 0;
  for (const segment of segments) {
    if (segment.kind !== "cite") continue;
    marked += text.slice(last, segment.start);
    marked += `${MARK_OPEN}${segment.n}${MARK_CLOSE}`;
    last = segment.end;
  }
  return marked + text.slice(last);
}

/**
 * The marker of a source.
 *
 * A page source is a small button that opens the page. A pack source is not a
 * page: its marker is plain text, with the snippet as its tooltip, and it
 * carries the same visual weight as the button.
 */
const CiteMarker: React.FC<{ citation: Citation; onCite: (citation: Citation) => void }> = ({ citation, onCite }) => {
  if (citation.collection === "pack") {
    return React.createElement(
      "sup",
      { className: "text-2xs" },
      React.createElement(
        "span",
        {
          className: "ml-0.5 rounded-xs bg-[var(--osio-accent-subtle)] px-1 text-[var(--osio-accent)]",
          title: citation.snippet,
          "aria-label": `Source ${citation.n}: ${citation.title}`,
        },
        String(citation.n),
      ),
    );
  }
  return React.createElement(
    "sup",
    { className: "text-2xs" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "ml-0.5 cursor-pointer rounded-xs bg-[var(--osio-accent-subtle)] px-1 text-[var(--osio-accent)]",
        title: citation.title,
        "aria-label": `Source ${citation.n}: ${citation.title}`,
        onClick: () => onCite(citation),
      },
      String(citation.n),
    ),
  );
};

/**
 * The rendered answer, with every token turned into the button of its source.
 *
 * The walk goes through the elements the engine produced: the tokens live in
 * text nodes, and each of them is cut out of its text and replaced.
 */
function withMarkers(
  node: React.ReactNode,
  sources: Map<number, Citation>,
  onCite: (citation: Citation) => void,
  keyPrefix: string,
): React.ReactNode {
  if (typeof node === "string") {
    if (!node.includes(MARK_OPEN)) return node;
    const parts = node.split(MARK_SPLIT);
    if (parts.length === 1) return node;
    return parts.map((part, index) => {
      const match = MARK.exec(part);
      if (!match) return part;
      const citation = sources.get(Number(match[1]));
      if (!citation) return part;
      return React.createElement(CiteMarker, { key: `${keyPrefix}-${index}`, citation, onCite });
    });
  }
  if (Array.isArray(node)) {
    return node.map((child, index) => withMarkers(child, sources, onCite, `${keyPrefix}.${index}`));
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    const children = element.props.children;
    if (children === undefined || children === null) return node;
    return React.cloneElement(element, {}, withMarkers(children, sources, onCite, keyPrefix));
  }
  return node;
}

/**
 * The answer, as the reader sees it: markdown, with the sources marked.
 *
 * Without a source the answer is the plain markdown it always was — the same
 * options, the same engine, the same safety.
 */
export function renderCitedAnswer(
  markdown: string,
  citations: Citation[],
  onCite: (citation: Citation) => void,
): React.ReactElement[] {
  const elements = renderReact(parse(markCitations(markdown, citations)), ASSISTANT_MARKDOWN_OPTIONS);
  if (citations.length === 0) return elements;
  const sources = new Map(citations.map((citation) => [citation.n, citation]));
  return withMarkers(elements, sources, onCite, "m") as React.ReactElement[];
}

/**
 * The sources of an answer, under it.
 *
 * Each source reads `n. Title`, and carries the snippet as its tooltip — the
 * text the answer drew on. Both are plain text. A page source is a button that
 * opens the page; a pack source is a plain line, labelled with where it comes
 * from, because there is no page to open.
 */
const SOURCE_CHIP = "inline-block max-w-64 truncate rounded-full border px-2.5 py-1";

export function renderCitationSources(
  citations: Citation[],
  onOpen: (citation: Citation) => void,
): React.ReactElement | null {
  if (citations.length === 0) return null;
  return React.createElement(
    "div",
    { className: "mt-3 flex flex-col gap-1.5", "data-testid": "chat-sources" },
    React.createElement("p", { className: "m-0 text-xs font-medium text-[var(--osio-fg-subtle)]" }, "Sources"),
    React.createElement(
      "ul",
      { className: "m-0 flex list-none flex-wrap gap-1.5 p-0 text-xs" },
      ...citations.map((citation) =>
        React.createElement(
          "li",
          { key: citation.n },
          citation.collection === "pack"
            ? React.createElement(
                "span",
                { className: `${SOURCE_CHIP} border-dashed border-[var(--osio-border-default)] text-[var(--osio-fg-muted)]`, title: citation.snippet },
                `${citation.n}. ${citation.title} · osionos docs`,
              )
            : React.createElement(
                "button",
                {
                  type: "button",
                  className: `${SOURCE_CHIP} border-transparent bg-[var(--osio-bg-subtle)] text-left text-[var(--osio-fg-default)] transition-colors hover:border-[var(--osio-accent)] hover:text-[var(--osio-accent-text)]`,
                  title: citation.snippet,
                  "aria-label": `Open source ${citation.n}: ${citation.title}`,
                  onClick: () => onOpen(citation),
                },
                `${citation.n}. ${citation.title}`,
              ),
        ),
      ),
    ),
  );
}
