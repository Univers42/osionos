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

// Every dispatch first-char is ASCII, so a 128-slot table answers "can this
// char start a match?" without materializing a single-char string per char —
// the plain-prose fast path scans on charCodes alone.
function findTextRunEnd(text: string, pos: number): number {
  let cursor = pos + 1;
  const length = text.length;
  while (cursor < length) {
    const code = text.charCodeAt(cursor);
    if (code === 10 || (code < 128 && DISPATCH_CODES[code] === 1)) break;
    cursor++;
  }
  return cursor;
}

export function parseInline(text: string): InlineNode[] {
  if (!text) return [];
  const nodes: InlineNode[] = [];
  let pos = 0;
  const length = text.length;
  while (pos < length) {
    const code = text.charCodeAt(pos);
    if (code === 10) {
      handleNewline(nodes, text, pos);
      pos++;
      continue;
    }

    if (code >= 128 || DISPATCH_CODES[code] === 0) {
      const end = findTextRunEnd(text, pos);
      appendTextRun(nodes, text.slice(pos, end));
      pos = end;
      continue;
    }

    const result = tryMatchInline(text, pos, INLINE_DISPATCH[text[pos]]);
    if (result) {
      if (result.start > pos) {
        appendTextRun(nodes, text.slice(pos, result.start));
      }
      if (result.node) nodes.push(result.node);
      pos = result.end;
    } else {
      appendChar(nodes, text[pos]);
      pos++;
    }
  }
  return nodes;
}

const INLINE_DISPATCH: Record<string, InlineMatcher[]> = createInlineDispatch(parseInline);

const DISPATCH_CODES = new Uint8Array(128);
for (const key of Object.keys(INLINE_DISPATCH)) {
  DISPATCH_CODES[key.charCodeAt(0)] = 1;
}

