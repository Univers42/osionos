/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserInline.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:23:25 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:23:26 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — inline formatting parser
import type { InlineNode } from './ast';
import type { InlineMatcher } from './parserInlineTypes';
import { handleNewline, appendChar } from './parserInlineUtils';
import { createInlineMatchers } from './parserInlineMatchers';

export { slugify } from './parserInlineUtils';

/** Attempt to match an inline pattern at the given position. */
function tryMatchInline(text: string, pos: number): { start: number; end: number; node: InlineNode } | null {
  for (const matcher of INLINE_MATCHERS) {
    const result = matcher(text, pos);
    if (result) return result;
  }
  return null;
}

export function parseInline(text: string): InlineNode[] {
  if (!text) return [];
  const nodes: InlineNode[] = [];
  let pos = 0;
  while (pos < text.length) {
    const result = tryMatchInline(text, pos);
    if (result) {
      if (result.start > pos) {
        nodes.push({ type: 'text', value: text.slice(pos, result.start) });
      }
      nodes.push(result.node);
      pos = result.end;
    } else if (text[pos] === '\n') {
      handleNewline(nodes, text, pos);
      pos++;
    } else {
      appendChar(nodes, text[pos]);
      pos++;
    }
  }
  return nodes;
}

const INLINE_MATCHERS: InlineMatcher[] = createInlineMatchers(parseInline);

