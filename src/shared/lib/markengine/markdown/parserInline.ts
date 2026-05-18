/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserInline.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — inline formatting parser
import type { InlineNode } from './ast';
import type { InlineMatchResult, InlineMatcher } from './parserInlineTypes';
import { handleNewline, appendChar } from './parserInlineUtils';
import { createInlineDispatch } from './parserInlineMatchers';

export { slugify } from './parserInlineUtils';

/** Attempt to match an inline pattern at the given position. */
function tryMatchInline(
  text: string,
  pos: number,
  matchers: InlineMatcher[],
): InlineMatchResult | null {
  for (const matcher of matchers) {
    const result = matcher(text, pos);
    if (result) return result;
  }
  return null;
}

function appendTextRun(nodes: InlineNode[], value: string): void {
  const lastNode = nodes.at(-1);
  if (lastNode?.type === 'text') {
    lastNode.value += value;
  } else {
    nodes.push({ type: 'text', value });
  }
}

function findTextRunEnd(text: string, pos: number): number {
  let cursor = pos + 1;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\n' || INLINE_DISPATCH[char]) break;
    cursor++;
  }
  return cursor;
}

export function parseInline(text: string): InlineNode[] {
  if (!text) return [];
  const nodes: InlineNode[] = [];
  let pos = 0;
  while (pos < text.length) {
    if (text[pos] === '\n') {
      handleNewline(nodes, text, pos);
      pos++;
      continue;
    }

    const matchers = INLINE_DISPATCH[text[pos]];
    if (!matchers) {
      const end = findTextRunEnd(text, pos);
      appendTextRun(nodes, text.slice(pos, end));
      pos = end;
      continue;
    }

    const result = tryMatchInline(text, pos, matchers);
    if (result) {
      if (result.start > pos) {
        nodes.push({ type: 'text', value: text.slice(pos, result.start) });
      }
      nodes.push(result.node);
      pos = result.end;
    } else {
      appendChar(nodes, text[pos]);
      pos++;
    }
  }
  return nodes;
}

const INLINE_DISPATCH: Record<string, InlineMatcher[]> = createInlineDispatch(parseInline);

