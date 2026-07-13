/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineDialect.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editor STORES inline marks in a bracket dialect (see markengine
// inlineAst serializeInlineNode): [b] [i] [s] [u] [mark] [code] [color=x]
// [bg=x], plus markdown-style `code`, [text](href) links and ![alt](src)
// images. Interop exports must not leak that dialect — these translators
// rewrite it to standard markdown (or drop what has no portable form).

const REPEAT_LIMIT = 6; // nested wrappers resolve in a few passes

function repeatReplace(source: string, rules: Array<[RegExp, string]>): string {
  let current = source;
  for (let pass = 0; pass < REPEAT_LIMIT; pass++) {
    let next = current;
    for (const [pattern, replacement] of rules) next = next.replace(pattern, replacement);
    if (next === current) return next;
    current = next;
  }
  return current;
}

const TO_MARKDOWN: Array<[RegExp, string]> = [
  [/\[b\]\[i\]([\s\S]*?)\[\/i\]\[\/b\]/g, "***$1***"],
  [/\[b\]([\s\S]*?)\[\/b\]/g, "**$1**"],
  [/\[i\]([\s\S]*?)\[\/i\]/g, "*$1*"],
  [/\[s\]([\s\S]*?)\[\/s\]/g, "~~$1~~"],
  [/\[code\]([\s\S]*?)\[\/code\]/g, "`$1`"],
  // No portable markdown form — keep the text, drop the mark.
  [/\[u\]([\s\S]*?)\[\/u\]/g, "$1"],
  [/\[mark\]([\s\S]*?)\[\/mark\]/g, "$1"],
  [/\[color=[^\]]*\]([\s\S]*?)\[\/color\]/g, "$1"],
  [/\[bg=[^\]]*\]([\s\S]*?)\[\/bg\]/g, "$1"],
  [/\[\[page:([^\]]+)\]\]/g, ""],
];

/** Editor inline dialect → standard markdown. */
export function inlineToMarkdown(source: string): string {
  return repeatReplace(source, TO_MARKDOWN);
}

/**
 * Editor inline dialect → HTML tags, applied on ALREADY-ESCAPED text (the
 * bracket tags are plain ASCII, unaffected by HTML escaping). Underline and
 * highlight keep their real elements here — HTML can express them.
 */
const TO_HTML: Array<[RegExp, string]> = [
  [/\[b\]([\s\S]*?)\[\/b\]/g, "<strong>$1</strong>"],
  [/\[i\]([\s\S]*?)\[\/i\]/g, "<em>$1</em>"],
  [/\[s\]([\s\S]*?)\[\/s\]/g, "<s>$1</s>"],
  [/\[u\]([\s\S]*?)\[\/u\]/g, "<u>$1</u>"],
  [/\[mark\]([\s\S]*?)\[\/mark\]/g, "<mark>$1</mark>"],
  [/\[code\]([\s\S]*?)\[\/code\]/g, "<code>$1</code>"],
  [/\[color=[^\]]*\]([\s\S]*?)\[\/color\]/g, "$1"],
  [/\[bg=[^\]]*\]([\s\S]*?)\[\/bg\]/g, "$1"],
  [/\[\[page:([^\]]+)\]\]/g, ""],
];

export function inlineTagsToHtml(escapedSource: string): string {
  return repeatReplace(escapedSource, TO_HTML);
}

/** Editor inline dialect → plain text (for PDF / CSV-ish surfaces). */
export function stripInlineTags(source: string): string {
  return repeatReplace(source, [
    [/\[(b|i|s|u|mark|code)\]([\s\S]*?)\[\/\1\]/g, "$2"],
    [/\[(?:color|bg)=[^\]]*\]([\s\S]*?)\[\/(?:color|bg)\]/g, "$1"],
    [/\[\[page:([^\]]+)\]\]/g, ""],
  ]);
}
