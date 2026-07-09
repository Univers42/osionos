/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineAutoformat.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live markdown autoformat (Notion-style input rule).
 *
 * As the user types, an INCOMPLETE delimiter pair (`**Hello`) stays raw. The
 * moment a pair COMPLETES at the caret (`**Hello**`, `` `code` ``, `*i*`,
 * `__u__`, `~~s~~`, `==h==`, `***bi***`), the delimiters are consumed and the
 * span becomes canonical bracket source (`[b]Hello[/b]`) which renders as styled
 * HTML — no waiting for blur.
 *
 * Disambiguation (`*` vs `**`, `_` word-boundaries, code spans literal) is NOT
 * re-implemented here: we defer to the real inline parser. We only fire when the
 * just-typed char is a closing delimiter AND parsing the text before the caret
 * yields a styled node as its LAST child — i.e. the parser itself recognized a
 * freshly-closed pair ending exactly at the caret. Typing plain text, or inside
 * an already-styled span, leaves the last node as text (or unchanged), so the
 * rule is inert and never churns.
 */

import { parseInline } from "./markdown/parserInline";
import { getInlineNodesTextLength, serializeInlineNodes } from "./inlineAst";
import type { InlineNode } from "./markdown/ast";

export interface InlineAutoformatResult {
  /** New canonical (bracket) source with the completed pair's delimiters consumed. */
  source: string;
  /** New caret offset in RENDERED-plain-text coordinates (end of the styled content). */
  caret: number;
}

/** Types the parser produces from typed markdown-delimiter pairs. */
const STYLED_TYPES = new Set<InlineNode["type"]>([
  "bold",
  "italic",
  "bold_italic",
  "strikethrough",
  "underline",
  "highlight",
  "code",
  "code_rich",
]);

/** The final char of every inline closing delimiter this rule handles. */
const CLOSING_DELIMITERS = new Set(["*", "_", "`", "~", "="]);

/**
 * If a markdown style pair just closed at `caret`, return the canonicalized
 * source + caret; otherwise null (no transform). `caret` is a source-string
 * offset (== DOM plain-text offset in the common no-preceding-styled-span case).
 */
export function autoformatInlineMarkdown(
  source: string,
  caret: number,
): InlineAutoformatResult | null {
  if (caret <= 0 || caret > source.length) return null;

  const left = source.slice(0, caret);
  const lastChar = left[left.length - 1];
  if (!lastChar || !CLOSING_DELIMITERS.has(lastChar)) return null;

  const nodes = parseInline(left);
  if (nodes.length === 0) return null;

  const last = nodes[nodes.length - 1];
  if (!STYLED_TYPES.has(last.type)) return null;

  // A pair closed at the caret. Canonicalize the whole left side (idempotent for
  // parts that were already bracketed) and land the caret at the end of the now
  // styled content — the delimiters have no visible width, so that is the
  // visible length of everything before the caret.
  const newLeft = serializeInlineNodes(nodes);
  return {
    source: newLeft + source.slice(caret),
    caret: getInlineNodesTextLength(nodes),
  };
}
