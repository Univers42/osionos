/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkSourceEdit.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure helpers to locate and rewrite inline markdown links `[text](url)` within a
// block's source string — the single source of truth shared by EditableContent's
// Ctrl/Cmd-click link editor (the fields panel) and its inline raw-source reveal.
// The Nth match here lines up with the Nth `.editor-link` anchor in the rendered DOM.

export interface SourceLink {
  text: string;
  href: string;
  title?: string;
  /** Index of the opening `[` in source. */
  start: number;
  /** Index just past the closing `)` in source. */
  end: number;
}

// `[text](url)` or `[text](url "title")`, not preceded by `!` (that would be an image).
// href stops at whitespace/`)`, so an empty href — `[label]()` — matches with href="".
const LINK_RE = /(?<!!)\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"([^"]*)")?\s*\)/g;

export function findLinks(source: string): SourceLink[] {
  const links: SourceLink[] = [];
  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(source)) !== null) {
    links.push({
      text: match[1],
      href: match[2],
      title: match[3],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return links;
}

function toLinkSource(text: string, href: string, title?: string): string {
  return `[${text}](${href}${title ? ` "${title}"` : ""})`;
}

/** Replace the link at `index` (its `[text](url)` span) with a rewritten one. */
export function replaceLink(
  source: string,
  index: number,
  next: { text: string; href: string; title?: string },
): string {
  const link = findLinks(source)[index];
  if (!link) return source;
  return (
    source.slice(0, link.start) +
    toLinkSource(next.text || next.href, next.href, next.title) +
    source.slice(link.end)
  );
}

/** Unlink the link at `index`, leaving just its visible text. */
export function removeLink(source: string, index: number): string {
  const link = findLinks(source)[index];
  if (!link) return source;
  return source.slice(0, link.start) + link.text + source.slice(link.end);
}
